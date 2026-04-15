"""
RAG service for user DSB knowledge base.

Flow:
  index_user_dsb(user_id)   — chunks all DSB data → embeddings → user_memory
  retrieve_context(user_id, query) — embeds query → match_user_memory RPC → relevant chunks
"""

import asyncio
import logging
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.db import get_supabase

logger = logging.getLogger(__name__)

_openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SPHERE_NAMES = {
    1: "Личность",        2: "Ресурсы",          3: "Коммуникация",
    4: "Корни/Дом",       5: "Творчество",        6: "Здоровье/Труд",
    7: "Партнёрства",     8: "Трансформация",     9: "Смыслы/Философия",
    10: "Карьера",        11: "Сообщество",       12: "Бессознательное",
}

# Roles used in user_memory to distinguish DSB chunks from chat history
DSB_ROLE_PREFIX = "dsb:"
INSIGHT_ROLE_PREFIX = "dsb:insight"


async def _embed(text: str) -> list[float]:
    resp = await _openai.embeddings.create(
        model="text-embedding-3-small",
        input=text[:8000],  # safety cap
    )
    return resp.data[0].embedding


def _insight_to_text(ins: dict) -> str:
    sp = ins.get("primary_sphere", "?")
    sp_name = SPHERE_NAMES.get(sp, f"Сфера {sp}")
    triggers = ins.get("triggers") or []
    # Support both new field name (description) and legacy (energy_description)
    desc = ins.get('description') or ins.get('energy_description', '')
    insight_text = ins.get('insight', '')
    gift_text = ins.get('gift', '')
    return (
        f"Сфера: {sp_name} [{ins.get('influence_level', '')}] | Позиция: {ins.get('position', '')}\n"
        f"Тема: {ins.get('core_theme', '')}\n"
        f"Описание: {desc}\n"
        f"Инсайт: {insight_text}\n"
        f"Свет: {ins.get('light_aspect', '')}\n"
        f"Тень: {ins.get('shadow_aspect', '')}\n"
        f"Дар: {gift_text}\n"
        f"Задача развития: {ins.get('developmental_task', '')}\n"
        f"Ключ интеграции: {ins.get('integration_key', '')}\n"
        f"Триггеры: {', '.join(triggers)}"
    )


async def is_indexed(user_id: str) -> bool:
    """Check if DSB insight chunks already exist in user_memory for this user."""
    supabase = get_supabase()
    resp = (
        supabase.table("user_memory")
        .select("id")
        .eq("user_id", user_id)
        .like("role", f"{INSIGHT_ROLE_PREFIX}%")
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def _format_matches(matches: list[dict]) -> str:
    if not matches:
        return ""
    return "=== Релевантный контекст о пользователе ===\n" + "\n\n---\n".join(
        match["message"] for match in matches
    )


async def index_user_dsb(user_id: str) -> int:
    """
    Index all DSB data for a user into user_memory with embeddings.
    Deletes stale DSB chunks first, then inserts fresh ones.
    Returns number of chunks indexed.
    """
    supabase = get_supabase()

    # Remove stale DSB chunks
    supabase.table("user_memory").delete().eq("user_id", user_id).like(
        "role", f"{DSB_ROLE_PREFIX}%"
    ).execute()

    chunks: list[tuple[str, str]] = []  # (role, text)

    # ── Birth data ──────────────────────────────────────────────────────────
    birth_resp = supabase.table("user_birth_data").select(
        "birth_date,birth_time,birth_place,gender"
    ).eq("user_id", user_id).execute()
    if birth_resp.data:
        b = birth_resp.data[0]
        text = (
            f"Данные рождения пользователя\n"
            f"Дата: {b.get('birth_date', '')}  Время: {b.get('birth_time', '')}  "
            f"Место: {b.get('birth_place', '')}  Пол: {b.get('gender', '')}"
        )
        chunks.append((f"{DSB_ROLE_PREFIX}birth", text))

    # ── Portrait ─────────────────────────────────────────────────────────────
    portrait_resp = supabase.table("user_portraits").select("*").eq("user_id", user_id).execute()
    if portrait_resp.data:
        p = portrait_resp.data[0]
        dpd = p.get("deep_profile_data") or {}
        pol = dpd.get("polarities", {})
        strengths = ", ".join(pol.get("core_strengths") or [])
        shadows = ", ".join(pol.get("shadow_aspects") or [])
        text = (
            f"Психологический портрет пользователя\n"
            f"Суть: {p.get('core_identity', '')}\n"
            f"Архетип: {p.get('core_archetype', '')}  |  Роль: {p.get('narrative_role', '')}\n"
            f"Тип энергии: {p.get('energy_type', '')}  |  Сейчас интегрирует: {p.get('current_dynamic', '')}\n"
            f"Сильные стороны: {strengths}\n"
            f"Теневые паттерны: {shadows}"
        )
        chunks.append((f"{DSB_ROLE_PREFIX}portrait", text))

    # ── Insights ─────────────────────────────────────────────────────────────
    insights_resp = supabase.table("user_insights").select("*").eq("user_id", user_id).execute()
    for ins in (insights_resp.data or []):
        sp = ins.get("primary_sphere", 0)
        role = f"{DSB_ROLE_PREFIX}insight_s{sp}"
        chunks.append((role, _insight_to_text(ins)))

    if not chunks:
        logger.warning(f"No DSB data found for user {user_id}, nothing to index")
        return 0

    # ── Embed in parallel (batches of 20) ────────────────────────────────────
    async def embed_chunk(role: str, text: str) -> dict:
        embedding = await _embed(text)
        return {
            "user_id": user_id,
            "role": role,
            "message": text,
            "embedding": embedding,
        }

    batch_size = 20
    rows = []
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        batch_rows = await asyncio.gather(*[embed_chunk(r, t) for r, t in batch])
        rows.extend(batch_rows)

    supabase.table("user_memory").insert(rows).execute()
    logger.info(f"Indexed {len(rows)} DSB chunks for user {user_id}")
    return len(rows)


async def retrieve_context(user_id: str, query: str, k: int = 6, threshold: float = 0.3) -> str:
    context, _matches = await retrieve_context_with_matches(user_id, query, k=k, threshold=threshold)
    return context


async def retrieve_context_with_matches(
    user_id: str,
    query: str,
    k: int = 6,
    threshold: float = 0.3,
) -> tuple[str, list[dict]]:
    """
    Retrieve the most relevant DSB chunks for a given user query.
    Returns a formatted string plus structured matches for tracing.
    """
    try:
        embedding = await _embed(query)
        supabase = get_supabase()

        resp = supabase.rpc("match_user_memory", {
            "query_embedding": embedding,
            "match_threshold": threshold,
            "match_count": k,
            "p_user_id": user_id,
        }).execute()

        if not resp.data:
            return "", []

        # Filter to insight chunks only. Birth data / portrait should not dominate assistant retrieval.
        insight_matches = [
            {
                "chunk_id": row.get("id"),
                "role": row.get("role", ""),
                "similarity": float(row.get("similarity") or 0),
                "message": row.get("message", ""),
            }
            for row in resp.data
            if row.get("role", "").startswith(INSIGHT_ROLE_PREFIX)
        ]

        if not insight_matches:
            return "", []

        return _format_matches(insight_matches), insight_matches

    except Exception as e:
        logger.warning(f"RAG retrieval failed for user {user_id}: {e}")
        return "", []
