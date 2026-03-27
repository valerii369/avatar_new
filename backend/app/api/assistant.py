from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.db import get_supabase
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_NAME = "western_astrology"

AVATAR_SYSTEM_PROMPT = """Ты AVATAR Assistant — продвинутый эзотерический помощник.
Ты знаешь натальную карту пользователя и его глубинный профиль (DSB).
Отвечай кратко, ёмко, поддерживающе. Опирайся на контекст памяти и DSB-профиль при ответе.
Если в контексте нет прямого ответа — говори от своей экспертизы, но не выдумывай факты о карте."""

# ─── Models ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str
    content: str

class ChatRequest(BaseModel):
    user_id:  str
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    assistant_reply: str

# ─── Memory helpers ────────────────────────────────────────────────────────────

async def embed(text: str) -> list[float]:
    resp = await openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return resp.data[0].embedding


async def retrieve_memory(user_id: str, query_embedding: list[float], top_k: int = 5) -> list[str]:
    """Searches user_memory via pgvector RPC for relevant past messages."""
    supabase = get_supabase()
    if settings.SUPABASE_KEY == "mock-key":
        return []

    try:
        resp = supabase.rpc("match_user_memory", {
            "query_embedding": query_embedding,
            "match_threshold":  0.70,
            "match_count":      top_k,
            "p_user_id":        user_id,
        }).execute()
        return [r["message"] for r in (resp.data or [])]
    except Exception as e:
        logger.warning(f"Memory retrieval failed for {user_id}: {e}")
        return []


async def save_to_memory(user_id: str, message: str, role: str, embedding: list[float]):
    """Saves a message + its embedding to user_memory."""
    supabase = get_supabase()
    if settings.SUPABASE_KEY == "mock-key":
        return

    try:
        supabase.table("user_memory").insert({
            "user_id":   user_id,
            "message":   message,
            "role":      role,
            "embedding": embedding,
        }).execute()
    except Exception as e:
        logger.warning(f"Memory save failed for {user_id}: {e}")


async def get_dsb_context(user_id: str) -> str:
    """Fetches user's portrait summary and top insights for assistant context."""
    supabase = get_supabase()
    if settings.SUPABASE_KEY == "mock-key":
        return ""

    try:
        portrait_res = supabase.table("user_portraits").select(
            "core_identity,core_archetype,narrative_role,energy_type,current_dynamic,deep_profile_data"
        ).eq("user_id", user_id).execute()

        if not portrait_res.data:
            return ""

        p = portrait_res.data[0]

        # Top 1 insight per sphere for context (avoid token bloat)
        insights_res = supabase.table("user_insights").select(
            "primary_sphere,core_theme,influence_level"
        ).eq("user_id", user_id).eq("system", SYSTEM_NAME).eq("rank", 0).execute()

        sphere_map = {
            1: "Личность", 2: "Ресурсы", 3: "Мышление", 4: "Семья",
            5: "Творчество", 6: "Здоровье", 7: "Отношения", 8: "Трансформация",
            9: "Смысл", 10: "Карьера", 11: "Социум", 12: "Тень"
        }

        top_themes = [
            f"• Сфера {sphere_map.get(r['primary_sphere'], r['primary_sphere'])}: {r['core_theme']}"
            for r in (insights_res.data or [])
            if r.get("influence_level") == "high"
        ][:6]

        lines = [
            f"[DSB-Профиль пользователя]",
            f"Архетип: {p.get('core_archetype', '')}",
            f"Сущность: {p.get('core_identity', '')}",
            f"Роль: {p.get('narrative_role', '')}",
            f"Энергия: {p.get('energy_type', '')}",
            f"Динамика: {p.get('current_dynamic', '')}",
        ]
        if top_themes:
            lines.append("Ключевые темы:")
            lines.extend(top_themes)

        polarities = p.get("deep_profile_data", {}).get("polarities", {})
        if polarities.get("core_strengths"):
            lines.append(f"Дары: {', '.join(polarities['core_strengths'])}")
        if polarities.get("shadow_aspects"):
            lines.append(f"Тени: {', '.join(polarities['shadow_aspects'])}")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"DSB context fetch failed for {user_id}: {e}")
        return ""

# ─── /chat ─────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(req: ChatRequest):
    """
    Assistant chat with pgvector memory and DSB context injection.
    Flow:
      1. Embed user message
      2. Retrieve relevant memories (top-5)
      3. Fetch DSB portrait context
      4. Build messages array and call GPT-4o-mini
      5. Save user message + response to user_memory
    """
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    user_text = req.messages[-1].content

    # 1. Embed user message
    try:
        user_embedding = await embed(user_text)
    except Exception as e:
        logger.warning(f"Embedding failed, continuing without memory: {e}")
        user_embedding = None

    # 2. Retrieve memories
    memory_snippets: list[str] = []
    if user_embedding:
        memory_snippets = await retrieve_memory(req.user_id, user_embedding)

    # 3. DSB context
    dsb_context = await get_dsb_context(req.user_id)

    # 4. Build system prompt with context
    system_parts = [AVATAR_SYSTEM_PROMPT]
    if dsb_context:
        system_parts.append(f"\n\n{dsb_context}")
    if memory_snippets:
        mem_block = "\n".join(f"- {m}" for m in memory_snippets)
        system_parts.append(f"\n\n[Релевантные воспоминания пользователя]\n{mem_block}")

    messages = [{"role": "system", "content": "\n".join(system_parts)}]
    messages.extend({"role": m.role, "content": m.content} for m in req.messages)

    # 5. Call GPT-4o-mini
    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
        )
        reply = resp.choices[0].message.content
    except Exception as e:
        logger.error(f"Assistant chat failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to Assistant")

    # 6. Save to memory (fire-and-forget, don't block response)
    if user_embedding:
        await save_to_memory(req.user_id, user_text, "user", user_embedding)
        try:
            reply_embedding = await embed(reply)
            await save_to_memory(req.user_id, reply, "assistant", reply_embedding)
        except Exception as e:
            logger.warning(f"Reply embedding/save failed: {e}")

    return ChatResponse(assistant_reply=reply)
