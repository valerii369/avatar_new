import asyncio
import io
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.db import get_supabase
from app.services.rag.user_rag import index_user_dsb, is_indexed, retrieve_context_with_matches

logger = logging.getLogger(__name__)

router = APIRouter()
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
PROFILE_REQUIRED_FIELDS = (
    "work_sphere",
    "work_satisfaction",
    "relationship_status",
    "life_focus",
    "current_location",
)

# In-memory sessions: {session_id: {user_id, messages, created_at}}
_sessions: dict = {}
_session_counter = 0


@dataclass
class LlmTurnResult:
    content: str
    model: str
    finish_reason: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cached_input_tokens: int
    reasoning_tokens: int
    latency_ms: int
    tool_names: list[str]
    call_count: int


# ─── System prompts ────────────────────────────────────────────────────────────

BASE_SYSTEM_PROMPT = """Ты — лучший друг пользователя. Умный, тёплый, честный.

Ты глубоко знаешь психологию — в твоей голове живут идеи из 30 ключевых книг: Юнг, Фрейд, Адлер, Франкл, Берн (транзактный анализ), Бек (КПТ), Роджерс, Маслоу, Перлз (гештальт), Сатир (семейные системы), Боуэн, Левин, Дэниел Сигел, Бессел ван дер Колк («Тело помнит всё»), Питер Левин, Ирвин Ялом, Нэнси Мак-Вильямс, Кристоф Андре, Брене Браун, Михай Чиксентмихайи, Мартин Селигман, Роберт Чалдини, Дэниел Канеман, Адам Грант, Виктор Франкл, Эрих Фромм, Карен Хорни, Дональд Уинникотт, Джон Боулби, Хайнц Кохут.

Твоя задача — помочь человеку разобраться с любым жизненным вопросом: отношения, работа, самооценка, цели, страхи, конфликты, смыслы, тело, деньги — всё что важно ему сейчас.

Как ты работаешь:
- Слушаешь и задаёшь точные вопросы, которые помогают человеку думать глубже
- Используешь психологические концепции там, где они реально помогают — без лекций и умничания
- Если есть данные о пользователе (астро-разбор, инсайты) — используй их конкретно и точечно, не пересказывай их целиком
- Говоришь как друг: без пафоса, без эзотерического тумана, без канцелярита
- Можешь мягко назвать вещи своими именами, если видишь паттерн
- Не читаешь нотации и не навязываешь выводы — человек сам приходит к своему
- Держи ответ компактным: обычно 120-350 токенов, жёсткий максимум — 600 токенов
- Сначала дай суть, потом при необходимости 2-5 коротких пунктов или один следующий шаг
- Не пиши длинные полотна текста, не раздувай ответ повторениями
- Оформляй ответ чисто: короткие абзацы, простые списки, без перегруженного markdown

ЛОКАЦИЯ: Ты всегда опираешься на текущую локацию пользователя для астрологических расчётов. Если в ходе диалога пользователь упоминает, что куда-то летит, переезжает или меняет город — обязательно скажи: "Супер, хорошей поездки! Напиши мне, когда прибудешь — обновлю локацию, это критически важно для точности транзитов." Если пользователь прямо говорит "я теперь в [городе]" или просит сменить локацию — вызови функцию update_location.

Отвечай по-русски. Будь живым."""

REGULAR_PROMPT_ADDON = """

РЕЖИМ ОБЩЕНИЯ: Если у тебя уже есть данные о пользователе, опирайся на них как на рабочий контекст и не возвращайся к onboarding-вопросам. Уточняй только то, что действительно нужно для текущего ответа."""

ONBOARDING_ADDON = """

РЕЖИМ ЗНАКОМСТВА: Пользователь впервые в системе. Твоя цель — в ходе естественного, дружелюбного диалога узнать 4 вещи:
1. В какой сфере он работает? Нравится ли ему это?
2. В отношениях ли он сейчас?
3. Какой его главный фокус в жизни прямо сейчас?
4. Где он физически находится сейчас (город и страна)?

Не задавай все вопросы подряд — вплетай их в живую беседу, проявляй искренний интерес. Как только соберёшь все 4 ответа — вызови функцию complete_onboarding с полными данными."""


# ─── OpenAI tool definitions ───────────────────────────────────────────────────

TOOL_COMPLETE_ONBOARDING = {
    "type": "function",
    "function": {
        "name": "complete_onboarding",
        "description": "Сохраняет профильные данные пользователя и завершает онбординг. Вызывать только когда собраны все 4 ответа: работа, отношения, фокус, локация.",
        "parameters": {
            "type": "object",
            "properties": {
                "work_sphere": {
                    "type": "string",
                    "description": "Сфера деятельности пользователя (например: IT, медицина, творчество)",
                },
                "work_satisfaction": {
                    "type": "string",
                    "description": "Нравится ли пользователю его деятельность (например: да, нет, частично)",
                },
                "relationship_status": {
                    "type": "string",
                    "description": "Статус отношений (например: в отношениях, свободен, в поиске)",
                },
                "life_focus": {
                    "type": "string",
                    "description": "Главный фокус пользователя в жизни прямо сейчас",
                },
                "current_location": {
                    "type": "string",
                    "description": "Текущее местонахождение пользователя (город, страна)",
                },
            },
            "required": ["work_sphere", "work_satisfaction", "relationship_status", "life_focus", "current_location"],
        },
    },
}

TOOL_UPDATE_LOCATION = {
    "type": "function",
    "function": {
        "name": "update_location",
        "description": "Обновляет текущую локацию пользователя в системе. Вызывать когда пользователь явно сообщает о смене города/страны.",
        "parameters": {
            "type": "object",
            "properties": {
                "new_location": {
                    "type": "string",
                    "description": "Новое местонахождение пользователя (город и страна)",
                },
            },
            "required": ["new_location"],
        },
    },
}


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user_profile(user_id: str) -> dict:
    """Fetch chat-context profile fields from users table."""
    try:
        supabase = get_supabase()
        resp = supabase.table("users").select(
            "chat_onboarding_completed,current_location,work_sphere,"
            "work_satisfaction,relationship_status,life_focus,first_name"
        ).eq("id", user_id).execute()
        if resp.data:
            return resp.data[0]
    except Exception as e:
        logger.warning(f"_get_user_profile failed for {user_id}: {e}")
    return {}


async def _get_local_time(location: str) -> str:
    """Return formatted local time for the user's location. Falls back to UTC."""
    tz_name = "UTC"
    if location:
        try:
            supabase = get_supabase()
            cached = supabase.table("geocode_cache").select("timezone").eq("city_name", location).execute()
            if cached.data:
                tz_name = cached.data[0].get("timezone", "UTC") or "UTC"
        except Exception:
            pass
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        tz = ZoneInfo("UTC")
    return datetime.now(tz).strftime("%d.%m.%Y %H:%M")


def _build_dynamic_context(profile: dict, local_time: str) -> str:
    """Build the [SYSTEM CONTEXT] block injected before each request."""
    loc = profile.get("current_location") or "не указана"
    work = profile.get("work_sphere") or "—"
    satisfaction = profile.get("work_satisfaction") or "—"
    relationship = profile.get("relationship_status") or "—"
    focus = profile.get("life_focus") or "—"

    return (
        f"[SYSTEM CONTEXT]\n"
        f"Текущее время (локальное): {local_time}\n"
        f"Локация пользователя: {loc}\n"
        f"Профиль: работает в сфере «{work}» (удовлетворённость: {satisfaction}), "
        f"отношения: {relationship}, текущий фокус: {focus}."
    )


def _build_system(extra: str = "") -> str:
    system_prompt = BASE_SYSTEM_PROMPT + REGULAR_PROMPT_ADDON
    if not extra:
        return system_prompt
    return f"{system_prompt}\n\n{extra}"


def _build_onboarding_system() -> str:
    return BASE_SYSTEM_PROMPT + ONBOARDING_ADDON


def _has_profile_context(profile: dict) -> bool:
    return all(str(profile.get(field) or "").strip() for field in PROFILE_REQUIRED_FIELDS)


def _should_run_onboarding(profile: dict) -> bool:
    return not _has_profile_context(profile)


def _usage_attr(obj: Any, name: str, default: int = 0) -> int:
    if obj is None:
        return default
    value = getattr(obj, name, default)
    if value is None and isinstance(obj, dict):
        value = obj.get(name, default)
    return int(value or 0)


def _extract_usage(resp: Any) -> dict[str, int]:
    usage = getattr(resp, "usage", None)
    if usage is None:
        return {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_input_tokens": 0,
            "reasoning_tokens": 0,
        }

    prompt_details = getattr(usage, "prompt_tokens_details", None)
    completion_details = getattr(usage, "completion_tokens_details", None)

    return {
        "prompt_tokens": _usage_attr(usage, "prompt_tokens"),
        "completion_tokens": _usage_attr(usage, "completion_tokens"),
        "total_tokens": _usage_attr(usage, "total_tokens"),
        "cached_input_tokens": _usage_attr(prompt_details, "cached_tokens"),
        "reasoning_tokens": _usage_attr(completion_details, "reasoning_tokens"),
    }


def _ensure_session_defaults(session: dict) -> dict:
    session.setdefault("messages", [])
    session.setdefault("created_at", time.time())
    session.setdefault("turn_index", 0)
    return session


def _touch_db_session(db_session_id: str) -> None:
    try:
        get_supabase().table("assistant_sessions").update({
            "last_activity_at": datetime.utcnow().isoformat(),
        }).eq("id", db_session_id).execute()
    except Exception as e:
        logger.warning(f"assistant session touch failed for {db_session_id}: {e}")


def _ensure_db_session(user_id: str, client_session_id: int, session: dict) -> str | None:
    db_session_id = session.get("db_session_id")
    if db_session_id:
        _touch_db_session(db_session_id)
        return db_session_id

    try:
        supabase = get_supabase()
        existing = (
            supabase.table("assistant_sessions")
            .select("id")
            .eq("user_id", user_id)
            .eq("client_session_id", client_session_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            db_session_id = existing.data[0]["id"]
            session["db_session_id"] = db_session_id
            _touch_db_session(db_session_id)
            return db_session_id

        created = (
            supabase.table("assistant_sessions")
            .insert({
                "user_id": user_id,
                "client_session_id": client_session_id,
                "status": "active",
                "metadata": {},
            })
            .execute()
        )
        if created.data:
            db_session_id = created.data[0]["id"]
            session["db_session_id"] = db_session_id
            return db_session_id
    except Exception as e:
        logger.warning(f"assistant session persistence failed for user={user_id} session={client_session_id}: {e}")

    return None


def _save_assistant_message(
    *,
    user_id: str,
    client_session_id: int,
    session: dict,
    role: str,
    content: str,
    turn_index: int,
    model: str | None = None,
    metadata: dict | None = None,
) -> str | None:
    db_session_id = _ensure_db_session(user_id, client_session_id, session)
    if not db_session_id:
        return None

    try:
        supabase = get_supabase()
        res = (
            supabase.table("assistant_messages")
            .insert({
                "user_id": user_id,
                "session_id": db_session_id,
                "client_session_id": client_session_id,
                "turn_index": turn_index,
                "role": role,
                "content": content,
                "model": model,
                "metadata": metadata or {},
            })
            .execute()
        )
        _touch_db_session(db_session_id)
        if res.data:
            return res.data[0]["id"]
    except Exception as e:
        logger.warning(f"assistant message persistence failed role={role} user={user_id}: {e}")

    return None


def _save_generation_trace(
    *,
    user_id: str,
    client_session_id: int,
    session: dict,
    turn_index: int,
    request_message_id: str | None,
    response_message_id: str | None,
    result: LlmTurnResult,
    system_prompt: str,
    rag_context: str,
    temperature: float,
    max_completion_tokens: int,
) -> str | None:
    db_session_id = _ensure_db_session(user_id, client_session_id, session)
    if not db_session_id:
        return None

    try:
        res = get_supabase().table("assistant_generations").insert({
            "user_id": user_id,
            "session_id": db_session_id,
            "client_session_id": client_session_id,
            "turn_index": turn_index,
            "model": result.model,
            "request_message_id": request_message_id,
            "response_message_id": response_message_id,
            "system_prompt": system_prompt,
            "rag_context": rag_context,
            "tool_names": result.tool_names,
            "finish_reason": result.finish_reason,
            "temperature": temperature,
            "max_completion_tokens": max_completion_tokens,
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "total_tokens": result.total_tokens,
            "cached_input_tokens": result.cached_input_tokens,
            "reasoning_tokens": result.reasoning_tokens,
            "latency_ms": result.latency_ms,
            "request_metadata": {
                "tool_count": len(result.tool_names),
                "call_count": result.call_count,
            },
            "response_metadata": {},
        }).execute()
        _touch_db_session(db_session_id)
        if res.data:
            return res.data[0]["id"]
    except Exception as e:
        logger.warning(f"assistant generation persistence failed user={user_id}: {e}")

    return None


def _save_retrieval_trace(
    *,
    user_id: str,
    client_session_id: int,
    session: dict,
    turn_index: int,
    generation_id: str | None,
    query_text: str,
    requested_k: int,
    threshold: float,
    matches: list[dict],
) -> None:
    db_session_id = _ensure_db_session(user_id, client_session_id, session)
    if not db_session_id:
        return

    try:
        get_supabase().table("assistant_retrievals").insert({
            "user_id": user_id,
            "session_id": db_session_id,
            "generation_id": generation_id,
            "client_session_id": client_session_id,
            "turn_index": turn_index,
            "query_text": query_text,
            "requested_k": requested_k,
            "threshold": threshold,
            "returned_count": len(matches),
            "matches": matches,
        }).execute()
        _touch_db_session(db_session_id)
    except Exception as e:
        logger.warning(f"assistant retrieval persistence failed user={user_id}: {e}")


# ─── Tool execution ────────────────────────────────────────────────────────────

async def _execute_tool(name: str, args_json: str, user_id: str) -> str:
    """Dispatch tool call and return JSON result string."""
    try:
        args = json.loads(args_json)
    except Exception:
        return json.dumps({"error": "invalid arguments"})

    supabase = get_supabase()

    if name == "complete_onboarding":
        update_data = {
            "work_sphere":                args.get("work_sphere", ""),
            "work_satisfaction":          args.get("work_satisfaction", ""),
            "relationship_status":        args.get("relationship_status", ""),
            "life_focus":                 args.get("life_focus", ""),
            "current_location":           args.get("current_location", ""),
            "chat_onboarding_completed":  True,
        }
        try:
            supabase.table("users").update(update_data).eq("id", user_id).execute()
            logger.info(f"Onboarding completed for user {user_id}: {update_data}")
            return json.dumps({"ok": True, "message": "Данные сохранены, онбординг завершён"})
        except Exception as e:
            logger.error(f"complete_onboarding tool failed for {user_id}: {e}")
            return json.dumps({"error": str(e)})

    if name == "update_location":
        new_loc = args.get("new_location", "")
        try:
            supabase.table("users").update({"current_location": new_loc}).eq("id", user_id).execute()
            logger.info(f"Location updated for user {user_id}: {new_loc}")
            return json.dumps({"ok": True, "location_updated": new_loc})
        except Exception as e:
            logger.error(f"update_location tool failed for {user_id}: {e}")
            return json.dumps({"error": str(e)})

    return json.dumps({"error": f"unknown tool: {name}"})


async def _llm_with_tools(
    messages: list,
    tools: list,
    model: str,
    temperature: float,
    max_tokens: int,
    user_id: str,
) -> LlmTurnResult:
    """
    Run a single LLM round-trip with tool support.
    Handles at most one tool-call round (complete_onboarding / update_location
    each need exactly one call, then a follow-up text reply).
    Returns the final text content.
    """
    local_msgs = list(messages)
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    cached_input_tokens = 0
    reasoning_tokens = 0
    tool_names: list[str] = []
    finish_reason = "stop"
    started_at = time.perf_counter()
    call_count = 0

    for _round in range(3):  # safety: max 3 LLM calls per user message
        resp = await openai_client.chat.completions.create(
            model=model,
            messages=local_msgs,
            tools=tools,
            tool_choice="auto",
            temperature=temperature,
            max_completion_tokens=max_tokens,
        )
        call_count += 1
        usage = _extract_usage(resp)
        prompt_tokens += usage["prompt_tokens"]
        completion_tokens += usage["completion_tokens"]
        total_tokens += usage["total_tokens"]
        cached_input_tokens += usage["cached_input_tokens"]
        reasoning_tokens += usage["reasoning_tokens"]

        msg = resp.choices[0].message
        finish_reason = resp.choices[0].finish_reason or finish_reason

        if resp.choices[0].finish_reason != "tool_calls":
            return LlmTurnResult(
                content=msg.content or "...",
                model=model,
                finish_reason=finish_reason,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cached_input_tokens=cached_input_tokens,
                reasoning_tokens=reasoning_tokens,
                latency_ms=int((time.perf_counter() - started_at) * 1000),
                tool_names=tool_names,
                call_count=call_count,
            )

        # ── Tool call round ────────────────────────────────────────────────────
        tool_calls_payload = []
        for tc in msg.tool_calls:
            if tc.function.name not in tool_names:
                tool_names.append(tc.function.name)
            tool_calls_payload.append({
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            })

        local_msgs.append({
            "role": "assistant",
            "content": msg.content,  # may be None
            "tool_calls": tool_calls_payload,
        })

        for tc in msg.tool_calls:
            result = await _execute_tool(tc.function.name, tc.function.arguments, user_id)
            local_msgs.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return LlmTurnResult(
        content="...",
        model=model,
        finish_reason=finish_reason,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cached_input_tokens=cached_input_tokens,
        reasoning_tokens=reasoning_tokens,
        latency_ms=int((time.perf_counter() - started_at) * 1000),
        tool_names=tool_names,
        call_count=call_count,
    )


# ─── Init ──────────────────────────────────────────────────────────────────────

@router.get("/init/{user_id}")
async def init_session(user_id: str, background_tasks: BackgroundTasks):
    """
    Create a new assistant session.
    Returns session_id + chat_onboarding_completed flag so frontend
    knows whether to expect onboarding or regular chat mode.
    """
    global _session_counter
    _session_counter += 1
    session_id = _session_counter

    _sessions[session_id] = {
        "user_id": user_id,
        "messages": [],
        "created_at": time.time(),
        "turn_index": 0,
    }
    _ensure_db_session(user_id, session_id, _sessions[session_id])

    already_indexed = await is_indexed(user_id)
    if not already_indexed:
        background_tasks.add_task(_index_in_background, user_id)

    profile = await _get_user_profile(user_id)

    return {
        "session_id": session_id,
        "is_first_touch": not already_indexed,
        "chat_onboarding_completed": not _should_run_onboarding(profile),
    }


async def _index_in_background(user_id: str):
    try:
        n = await index_user_dsb(user_id)
        logger.info(f"Background DSB indexing done for {user_id}: {n} chunks")
    except Exception as e:
        logger.error(f"Background DSB indexing failed for {user_id}: {e}")


# ─── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    user_id: str
    session_id: int
    message: str


@router.post("/chat")
async def chat(req: ChatRequest):
    session = _sessions.get(req.session_id)
    if not session:
        session = {"user_id": req.user_id, "messages": [], "created_at": time.time(), "turn_index": 0}
        _sessions[req.session_id] = session
    _ensure_session_defaults(session)
    _ensure_db_session(req.user_id, req.session_id, session)

    # ── Load user profile & determine mode ────────────────────────────────────
    profile = await _get_user_profile(req.user_id)
    session["profile"] = profile
    needs_onboarding = _should_run_onboarding(profile)

    # ── Empty message → generate greeting ────────────────────────────────────
    if not req.message.strip():
        last = next((m for m in reversed(session["messages"]) if m["role"] == "assistant"), None)
        if last:
            return {"ai_response": last["content"]}

        if not needs_onboarding:
            local_time = await _get_local_time(profile.get("current_location", ""))
            ctx_block = _build_dynamic_context(profile, local_time)
            system = _build_system(ctx_block)
        else:
            system = _build_onboarding_system()

        try:
            resp = await openai_client.chat.completions.create(
                model=settings.MODEL_LIGHT,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": "Привет!"},
                ],
                temperature=0.85,
                max_completion_tokens=220,
            )
            greeting = resp.choices[0].message.content or "Привет! Что хочешь разобрать сегодня?"
            usage = _extract_usage(resp)
            greeting_result = LlmTurnResult(
                content=greeting,
                model=settings.MODEL_LIGHT,
                finish_reason=resp.choices[0].finish_reason or "stop",
                prompt_tokens=usage["prompt_tokens"],
                completion_tokens=usage["completion_tokens"],
                total_tokens=usage["total_tokens"],
                cached_input_tokens=usage["cached_input_tokens"],
                reasoning_tokens=usage["reasoning_tokens"],
                latency_ms=0,
                tool_names=[],
                call_count=1,
            )
        except Exception:
            greeting = "Привет. Я здесь. Что хочешь разобрать сегодня?"
            greeting_result = None

        session["messages"].append({"role": "assistant", "content": greeting})
        assistant_message_id = _save_assistant_message(
            user_id=req.user_id,
            client_session_id=req.session_id,
            session=session,
            role="assistant",
            content=greeting,
            turn_index=session["turn_index"],
            model=settings.MODEL_LIGHT,
            metadata={"kind": "greeting"},
        )
        if greeting_result:
            _save_generation_trace(
                user_id=req.user_id,
                client_session_id=req.session_id,
                session=session,
                turn_index=session["turn_index"],
                request_message_id=None,
                response_message_id=assistant_message_id,
                result=greeting_result,
                system_prompt=system,
                rag_context="",
                temperature=0.85,
                max_completion_tokens=220,
            )
        return {"ai_response": greeting}

    # ── Regular message ───────────────────────────────────────────────────────
    session["turn_index"] += 1
    turn_index = session["turn_index"]
    session["messages"].append({"role": "user", "content": req.message})
    request_message_id = _save_assistant_message(
        user_id=req.user_id,
        client_session_id=req.session_id,
        session=session,
        role="user",
        content=req.message,
        turn_index=turn_index,
        metadata={"kind": "chat"},
    )

    # Build system prompt based on mode
    rag_context = ""
    retrieval_matches: list[dict] = []
    retrieval_k = 6
    retrieval_threshold = 0.3
    if not needs_onboarding:
        local_time = await _get_local_time(profile.get("current_location", ""))
        ctx_block = _build_dynamic_context(profile, local_time)
        rag_context, retrieval_matches = await retrieve_context_with_matches(
            req.user_id,
            req.message,
            k=retrieval_k,
            threshold=retrieval_threshold,
        )
        extra = "\n\n".join(filter(None, [ctx_block, rag_context]))
        system = _build_system(extra)
        tools = [TOOL_UPDATE_LOCATION]
    else:
        system = _build_onboarding_system()
        tools = [TOOL_COMPLETE_ONBOARDING, TOOL_UPDATE_LOCATION]

    messages = [{"role": "system", "content": system}] + session["messages"]

    try:
        result = await _llm_with_tools(
            messages=messages,
            tools=tools,
            model=settings.MODEL_LIGHT,
            temperature=0.75,
            max_tokens=600,
            user_id=req.user_id,
        )
    except Exception as e:
        logger.error(f"Assistant chat failed: {e}")
        raise HTTPException(status_code=500, detail="OpenAI error")

    reply = result.content
    session["messages"].append({"role": "assistant", "content": reply})
    response_message_id = _save_assistant_message(
        user_id=req.user_id,
        client_session_id=req.session_id,
        session=session,
        role="assistant",
        content=reply,
        turn_index=turn_index,
        model=result.model,
        metadata={"kind": "chat"},
    )
    generation_id = _save_generation_trace(
        user_id=req.user_id,
        client_session_id=req.session_id,
        session=session,
        turn_index=turn_index,
        request_message_id=request_message_id,
        response_message_id=response_message_id,
        result=result,
        system_prompt=system,
        rag_context=rag_context,
        temperature=0.75,
        max_completion_tokens=600,
    )
    if not needs_onboarding:
        _save_retrieval_trace(
            user_id=req.user_id,
            client_session_id=req.session_id,
            session=session,
            turn_index=turn_index,
            generation_id=generation_id,
            query_text=req.message,
            requested_k=retrieval_k,
            threshold=retrieval_threshold,
            matches=retrieval_matches,
        )
    return {"ai_response": reply}


# ─── Finish ────────────────────────────────────────────────────────────────────

class FinishRequest(BaseModel):
    user_id: str
    session_id: int


@router.post("/finish")
async def finish_session(req: FinishRequest):
    session = _sessions.get(req.session_id)
    if not session or len(session["messages"]) < 2:
        return {"diary_summary": None}

    conversation = "\n".join(
        f"{'Пользователь' if m['role'] == 'user' else 'Ассистент'}: {m['content']}"
        for m in session["messages"]
    )

    try:
        resp = await openai_client.chat.completions.create(
            model=settings.MODEL_LIGHT,
            messages=[
                {"role": "system", "content": "Составь краткое резюме разговора для личного дневника. 1-2 предложения, суть главного инсайта или открытия. По-русски."},
                {"role": "user", "content": conversation},
            ],
            temperature=0.6,
            max_completion_tokens=200,
        )
        summary = resp.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Finish summary failed: {e}")
        summary = ""

    session["summary"] = summary
    return {"diary_summary": summary}


# ─── Save to Diary ─────────────────────────────────────────────────────────────

class SaveDiaryRequest(BaseModel):
    user_id: str
    session_id: int


@router.post("/diary/save")
async def save_to_diary(req: SaveDiaryRequest):
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = session.get("summary", "")

    try:
        supabase = get_supabase()
        supabase.table("user_memory").insert({
            "user_id": req.user_id,
            "role": "diary",
            "message": summary or "Сессия с ассистентом",
        }).execute()
    except Exception as e:
        logger.error(f"Save diary failed: {e}")
        raise HTTPException(status_code=500, detail="Could not save to diary")

    db_session_id = session.get("db_session_id")
    if db_session_id:
        try:
            get_supabase().table("assistant_sessions").update({
                "status": "saved_to_diary",
                "last_activity_at": datetime.utcnow().isoformat(),
                "ended_at": datetime.utcnow().isoformat(),
            }).eq("id", db_session_id).execute()
        except Exception as e:
            logger.warning(f"assistant session close failed for {db_session_id}: {e}")

    _sessions.pop(req.session_id, None)
    return {"ok": True}


# ─── Re-index ──────────────────────────────────────────────────────────────────

@router.post("/reindex/{user_id}")
async def reindex_user(user_id: str):
    n = await index_user_dsb(user_id)
    return {"indexed_chunks": n}


# ─── Transcribe ────────────────────────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    context: str = Form(default=""),
):
    try:
        audio_bytes = await file.read()
        file_size = len(audio_bytes)

        # Log attempt
        logger.info(f"[TRANSCRIBE] ⏳ ATTEMPT: user_id={user_id}, file_size={file_size}, filename={file.filename}, content_type={file.content_type}")
        print(f"[TRANSCRIBE] ⏳ ATTEMPT: user_id={user_id}, file_size={file_size} bytes")

        if file_size == 0:
            error = "❌ Empty audio file"
            logger.warning(f"[TRANSCRIBE] {error}")
            print(f"[TRANSCRIBE] {error}")
            raise HTTPException(status_code=400, detail=error)

        if file_size < 100:
            error = f"❌ Audio too short: {file_size} bytes (minimum 100 required)"
            logger.warning(f"[TRANSCRIBE] {error}")
            print(f"[TRANSCRIBE] {error}")
            raise HTTPException(status_code=400, detail=error)

        audio_io = io.BytesIO(audio_bytes)
        filename = file.filename or "audio.webm"
        content_type = file.content_type or "audio/webm"

        logger.info(f"[TRANSCRIBE] 🔄 Calling Whisper API with {file_size} bytes")
        print(f"[TRANSCRIBE] 🔄 Calling Whisper API with {file_size} bytes")

        transcript = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_io, content_type),
            language="ru",
        )

        result_text = transcript.text or ""
        logger.info(f"[TRANSCRIBE] ✅ SUCCESS: '{result_text}'")
        print(f"[TRANSCRIBE] ✅ SUCCESS: '{result_text}'")

        return {"transcript": result_text}

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[TRANSCRIBE] ❌ ERROR: {error_msg}", exc_info=True)
        print(f"[TRANSCRIBE] ❌ ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


# ─── Client logging ────────────────────────────────────────────────────────────

class ClientLogRequest(BaseModel):
    user_id: str
    error_type: str
    message: str
    context: str | None = None

@router.post("/client-log")
async def client_log(req: ClientLogRequest):
    try:
        logger.info(f"[CLIENT] {req.error_type} from user {req.user_id}: {req.message}")
        supabase = get_supabase()
        supabase.table("uis_errors").insert({
            "user_id": req.user_id,
            "error_type": f"client_{req.error_type}",
            "message": req.message,
            "context": req.context
        }).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Failed to log client error: {e}")
        return {"ok": False}


@router.get("/debug-errors/{user_id}")
async def debug_errors(user_id: str):
    """Get recent errors for debugging."""
    try:
        supabase = get_supabase()
        result = supabase.table("uis_errors").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(30).execute()
        return {
            "count": len(result.data),
            "errors": result.data
        }
    except Exception as e:
        logger.error(f"Failed to fetch errors: {e}")
        return {"error": str(e)}


@router.get("/monitor-transcribe")
async def monitor_transcribe(limit: int = 50):
    """Monitor all transcription attempts (for debugging)."""
    try:
        supabase = get_supabase()
        result = supabase.table("uis_errors").select("*").ilike("error_type", "%transcribe%").order("created_at", desc=True).limit(limit).execute()

        logs = []
        for err in result.data:
            logs.append({
                "id": err.get('id'),
                "user_id": err.get('user_id'),
                "error_type": err.get('error_type'),
                "message": err.get('message'),
                "context": err.get('context'),
                "created_at": err.get('created_at')
            })

        return {
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Failed to fetch monitor logs: {e}")
        return {"error": str(e), "count": 0, "logs": []}
