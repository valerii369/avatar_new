import asyncio
import io
import json
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.db import get_supabase
from app.services.rag.user_rag import index_user_dsb, is_indexed, retrieve_context

logger = logging.getLogger(__name__)

router = APIRouter()
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# In-memory sessions: {session_id: {user_id, messages, created_at}}
_sessions: dict = {}
_session_counter = 0


# ─── System prompts ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Ты — лучший друг пользователя. Умный, тёплый, честный.

Ты глубоко знаешь психологию — в твоей голове живут идеи из 30 ключевых книг: Юнг, Фрейд, Адлер, Франкл, Берн (транзактный анализ), Бек (КПТ), Роджерс, Маслоу, Перлз (гештальт), Сатир (семейные системы), Боуэн, Левин, Дэниел Сигел, Бессел ван дер Колк («Тело помнит всё»), Питер Левин, Ирвин Ялом, Нэнси Мак-Вильямс, Кристоф Андре, Брене Браун, Михай Чиксентмихайи, Мартин Селигман, Роберт Чалдини, Дэниел Канеман, Адам Грант, Виктор Франкл, Эрих Фромм, Карен Хорни, Дональд Уинникотт, Джон Боулби, Хайнц Кохут.

Твоя задача — помочь человеку разобраться с любым жизненным вопросом: отношения, работа, самооценка, цели, страхи, конфликты, смыслы, тело, деньги — всё что важно ему сейчас.

Как ты работаешь:
- Слушаешь и задаёшь точные вопросы, которые помогают человеку думать глубже
- Используешь психологические концепции там, где они реально помогают — без лекций и умничания
- Если есть данные о пользователе (астро-разбор, инсайты) — используй их конкретно и точечно, не пересказывай их целиком
- Говоришь как друг: без пафоса, без эзотерического тумана, без канцелярита
- Можешь мягко назвать вещи своими именами, если видишь паттерн
- Не читаешь нотации и не навязываешь выводы — человек сам приходит к своему

ЛОКАЦИЯ: Ты всегда опираешься на текущую локацию пользователя для астрологических расчётов. Если в ходе диалога пользователь упоминает, что куда-то летит, переезжает или меняет город — обязательно скажи: "Супер, хорошей поездки! Напиши мне, когда прибудешь — обновлю локацию, это критически важно для точности транзитов." Если пользователь прямо говорит "я теперь в [городе]" или просит сменить локацию — вызови функцию update_location.

Отвечай по-русски. Будь живым."""

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
    if not extra:
        return SYSTEM_PROMPT
    return f"{SYSTEM_PROMPT}\n\n{extra}"


def _build_onboarding_system() -> str:
    return SYSTEM_PROMPT + ONBOARDING_ADDON


async def _get_portrait_brief(user_id: str) -> str:
    try:
        supabase = get_supabase()
        resp = supabase.table("user_portraits").select(
            "core_identity,core_archetype,current_dynamic"
        ).eq("user_id", user_id).execute()
        if not resp.data:
            return ""
        p = resp.data[0]
        return (
            f"Краткий контекст о пользователе:\n"
            f"Суть: {p.get('core_identity', '')}\n"
            f"Архетип: {p.get('core_archetype', '')} | Сейчас: {p.get('current_dynamic', '')}"
        )
    except Exception:
        return ""


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
) -> str:
    """
    Run a single LLM round-trip with tool support.
    Handles at most one tool-call round (complete_onboarding / update_location
    each need exactly one call, then a follow-up text reply).
    Returns the final text content.
    """
    local_msgs = list(messages)

    for _round in range(3):  # safety: max 3 LLM calls per user message
        resp = await openai_client.chat.completions.create(
            model=model,
            messages=local_msgs,
            tools=tools,
            tool_choice="auto",
            temperature=temperature,
            max_completion_tokens=max_tokens,
        )

        msg = resp.choices[0].message

        if resp.choices[0].finish_reason != "tool_calls":
            return msg.content or "..."

        # ── Tool call round ────────────────────────────────────────────────────
        tool_calls_payload = []
        for tc in msg.tool_calls:
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

    return "..."  # fallback if loop exhausted


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
    }

    already_indexed = await is_indexed(user_id)
    if not already_indexed:
        background_tasks.add_task(_index_in_background, user_id)

    profile = await _get_user_profile(user_id)

    return {
        "session_id": session_id,
        "is_first_touch": not already_indexed,
        "chat_onboarding_completed": profile.get("chat_onboarding_completed", False),
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
        session = {"user_id": req.user_id, "messages": [], "created_at": time.time()}
        _sessions[req.session_id] = session

    # ── Load user profile & determine mode ────────────────────────────────────
    profile = await _get_user_profile(req.user_id)
    onboarding_done = profile.get("chat_onboarding_completed", False)

    # ── Empty message → generate greeting ────────────────────────────────────
    if not req.message.strip():
        last = next((m for m in reversed(session["messages"]) if m["role"] == "assistant"), None)
        if last:
            return {"ai_response": last["content"]}

        portrait_context = await _get_portrait_brief(req.user_id)

        if onboarding_done:
            local_time = await _get_local_time(profile.get("current_location", ""))
            ctx_block = _build_dynamic_context(profile, local_time)
            system = _build_system("\n\n".join(filter(None, [ctx_block, portrait_context])))
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
                max_completion_tokens=300,
            )
            greeting = resp.choices[0].message.content or "Привет! Что хочешь разобрать сегодня?"
        except Exception:
            greeting = "Привет. Я здесь. Что хочешь разобрать сегодня?"

        session["messages"].append({"role": "assistant", "content": greeting})
        return {"ai_response": greeting}

    # ── Regular message ───────────────────────────────────────────────────────
    session["messages"].append({"role": "user", "content": req.message})

    # Build system prompt based on mode
    if onboarding_done:
        local_time = await _get_local_time(profile.get("current_location", ""))
        ctx_block = _build_dynamic_context(profile, local_time)
        rag_context = await retrieve_context(req.user_id, req.message, k=6)
        extra = "\n\n".join(filter(None, [ctx_block, rag_context]))
        system = _build_system(extra)
        tools = [TOOL_UPDATE_LOCATION]
    else:
        system = _build_onboarding_system()
        tools = [TOOL_COMPLETE_ONBOARDING, TOOL_UPDATE_LOCATION]

    messages = [{"role": "system", "content": system}] + session["messages"]

    try:
        reply = await _llm_with_tools(
            messages=messages,
            tools=tools,
            model=settings.MODEL_LIGHT,
            temperature=0.75,
            max_tokens=800,
            user_id=req.user_id,
        )
    except Exception as e:
        logger.error(f"Assistant chat failed: {e}")
        raise HTTPException(status_code=500, detail="OpenAI error")

    session["messages"].append({"role": "assistant", "content": reply})
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
        audio_io = io.BytesIO(audio_bytes)
        filename = file.filename or "audio.webm"
        content_type = file.content_type or "audio/webm"

        transcript = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_io, content_type),
            language="ru",
        )

        return {"transcript": transcript.text}

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Transcription failed")
