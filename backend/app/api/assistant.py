from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict
from openai import AsyncOpenAI
import logging
import time
import io
from app.core.config import settings
from app.core.db import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ─── In-memory session store ──────────────────────────────────────────────────
# session_id → { user_id, messages, context, summary, created_at }
_sessions: Dict[int, dict] = {}
_session_counter = 0

SYSTEM_PROMPT = (
    "Ты AVATAR — персональный эзотерический ассистент. "
    "Помогаешь пользователю исследовать внутреннее пространство: архетипы, паттерны, ресурсы, тени. "
    "Отвечай вдумчиво, поддерживающе, конкретно. Избегай пустых фраз. "
    "Если есть данные пользователя — опирайся на них."
)

# ─── /init/{user_id} ──────────────────────────────────────────────────────────

@router.get("/init/{user_id}")
async def init_session(user_id: str):
    """Create or reuse an assistant session for this user."""
    global _session_counter

    # Reuse existing active session
    for sid, session in _sessions.items():
        if session["user_id"] == user_id:
            return {"session_id": sid, "is_first_touch": False}

    # Load DSB context from portrait
    context = ""
    try:
        supabase = get_supabase()
        portrait_res = supabase.table("user_portraits").select(
            "core_identity,core_archetype,narrative_role,energy_type"
        ).eq("user_id", user_id).execute()
        if portrait_res.data:
            p = portrait_res.data[0]
            context = (
                f"\n\nКонтекст пользователя: "
                f"архетип — {p.get('core_archetype', 'неизвестен')}, "
                f"идентичность — {p.get('core_identity', '')}, "
                f"роль — {p.get('narrative_role', '')}, "
                f"тип энергии — {p.get('energy_type', '')}."
            )
    except Exception as e:
        logger.warning(f"Could not load portrait for assistant context: {e}")

    _session_counter += 1
    sid = _session_counter
    _sessions[sid] = {
        "user_id": user_id,
        "messages": [],
        "context": context,
        "summary": None,
        "created_at": time.time(),
    }

    return {"session_id": sid, "is_first_touch": True}


# ─── /chat ────────────────────────────────────────────────────────────────────

class AssistantChatRequest(BaseModel):
    user_id: str
    session_id: int
    message: str

@router.post("/chat")
async def chat(req: AssistantChatRequest):
    """Send a message and get AI response. Empty message returns a greeting."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please reinitialize.")

    # Empty message → greeting
    if not req.message.strip():
        greeting = (
            "Привет! Я твой AVATAR — пространство для диалога с собой. "
            "О чём хочешь поговорить сегодня?"
        )
        session["messages"].append({"role": "assistant", "content": greeting})
        return {"ai_response": greeting}

    # Add user message
    session["messages"].append({"role": "user", "content": req.message})

    try:
        system = SYSTEM_PROMPT + (session.get("context") or "")
        messages = [{"role": "system", "content": system}] + session["messages"][-20:]

        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
        )

        reply = resp.choices[0].message.content or ""
        session["messages"].append({"role": "assistant", "content": reply})
        return {"ai_response": reply}

    except Exception as e:
        logger.error(f"Assistant chat error: {e}")
        raise HTTPException(status_code=500, detail="Chat failed")


# ─── /finish ──────────────────────────────────────────────────────────────────

class FinishRequest(BaseModel):
    user_id: str
    session_id: int

@router.post("/finish")
async def finish(req: FinishRequest):
    """Generate a diary summary for the session."""
    session = _sessions.get(req.session_id)
    if not session or not session["messages"]:
        return {"diary_summary": None}

    try:
        history_text = "\n".join(
            [f"{m['role'].upper()}: {m['content']}" for m in session["messages"][-12:]]
        )

        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Напиши краткое резюме (1–2 предложения) этого диалога для личного дневника. "
                        "Фокус на инсайтах и ключевых осознаниях пользователя."
                    ),
                },
                {"role": "user", "content": history_text},
            ],
            max_tokens=200,
            temperature=0.5,
        )

        summary = resp.choices[0].message.content or "Сессия завершена."
        session["summary"] = summary
        return {"diary_summary": summary}

    except Exception as e:
        logger.error(f"Assistant finish error: {e}")
        return {"diary_summary": "Сессия завершена."}


# ─── /diary/save ──────────────────────────────────────────────────────────────

class SaveDiaryRequest(BaseModel):
    user_id: str
    session_id: int

@router.post("/diary/save")
async def save_diary(req: SaveDiaryRequest):
    """Save session summary to user_memory with embedding."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = session.get("summary") or "Сессия с ассистентом"

    try:
        supabase = get_supabase()

        # Generate embedding
        emb_resp = await openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=summary,
        )
        embedding = emb_resp.data[0].embedding

        supabase.table("user_memory").insert({
            "user_id": req.user_id,
            "content": summary,
            "embedding": embedding,
        }).execute()

        # Clean up session
        _sessions.pop(req.session_id, None)

        return {"status": "saved"}

    except Exception as e:
        logger.error(f"Diary save error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save diary")


# ─── /transcribe ──────────────────────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    context: str = Form(default=""),
):
    """Transcribe audio using OpenAI Whisper."""
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
