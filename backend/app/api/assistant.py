import asyncio
import logging
import time
from fastapi import APIRouter, BackgroundTasks, HTTPException
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

Отвечай по-русски. Будь живым."""


def _build_system(context: str = "") -> str:
    if not context:
        return SYSTEM_PROMPT
    return f"{SYSTEM_PROMPT}\n\n{context}"


# ─── Init ──────────────────────────────────────────────────────────────────────

@router.get("/init/{user_id}")
async def init_session(user_id: str, background_tasks: BackgroundTasks):
    """
    Create a new assistant session.
    - If user's DSB is not indexed yet → trigger indexing in background
    - Return session_id + greeting
    """
    global _session_counter
    _session_counter += 1
    session_id = _session_counter

    _sessions[session_id] = {
        "user_id": user_id,
        "messages": [],
        "created_at": time.time(),
    }

    # Trigger indexing in background if not done yet
    already_indexed = await is_indexed(user_id)
    if not already_indexed:
        background_tasks.add_task(_index_in_background, user_id)

    # Greeting — use portrait context if available (fast, no RAG needed yet)
    portrait_context = await _get_portrait_brief(user_id)

    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": _build_system(portrait_context)},
                {"role": "user", "content": "Привет!"},
            ],
            temperature=0.85,
            max_tokens=300,
        )
        greeting = resp.choices[0].message.content or "Привет! Что сегодня хочешь разобрать?"
    except Exception as e:
        logger.error(f"Greeting generation failed: {e}")
        greeting = "Привет. Я здесь. Что хочешь разобрать сегодня?"

    _sessions[session_id]["messages"].append({"role": "assistant", "content": greeting})

    return {
        "session_id": session_id,
        "is_first_touch": not already_indexed,
        "ai_response": greeting,
    }


async def _index_in_background(user_id: str):
    try:
        n = await index_user_dsb(user_id)
        logger.info(f"Background DSB indexing done for {user_id}: {n} chunks")
    except Exception as e:
        logger.error(f"Background DSB indexing failed for {user_id}: {e}")


async def _get_portrait_brief(user_id: str) -> str:
    """Quick portrait summary for greeting — no embedding needed."""
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


# ─── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    user_id: str
    session_id: int
    message: str


@router.post("/chat")
async def chat(req: ChatRequest):
    session = _sessions.get(req.session_id)
    if not session:
        # Session expired — recreate lightweight
        session = {"user_id": req.user_id, "messages": [], "created_at": time.time()}
        _sessions[req.session_id] = session

    # Empty message → return last greeting
    if not req.message.strip():
        last = next((m for m in reversed(session["messages"]) if m["role"] == "assistant"), None)
        return {"ai_response": last["content"] if last else "Готов слушать."}

    session["messages"].append({"role": "user", "content": req.message})

    # RAG: retrieve relevant DSB chunks for this message
    rag_context = await retrieve_context(req.user_id, req.message, k=6)

    system = _build_system(rag_context)
    messages = [{"role": "system", "content": system}] + session["messages"]

    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            temperature=0.75,
            max_tokens=800,
        )
        reply = resp.choices[0].message.content or "..."
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
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": "Составь краткое резюме разговора для личного дневника. 1-2 предложения, суть главного инсайта или открытия. По-русски."},
                {"role": "user", "content": conversation},
            ],
            temperature=0.6,
            max_tokens=200,
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


# ─── Re-index (admin/manual trigger) ──────────────────────────────────────────

@router.post("/reindex/{user_id}")
async def reindex_user(user_id: str):
    """Force re-index user's DSB data (e.g. after recalculation)."""
    n = await index_user_dsb(user_id)
    return {"indexed_chunks": n}
