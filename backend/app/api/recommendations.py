"""Recommendations API — transit-based personal forecasts."""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.core.db import get_supabase
from app.services.dsb.natal_chart import calculate_chart
from app.services.transits.engine import (
    PeriodType,
    calculate_transits,
    get_period_dates,
)
from app.services.transits.synthesis import synthesize_recommendation

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])
logger = logging.getLogger(__name__)


@router.post("/{user_id}/{period}")
async def get_recommendation(user_id: str, period: PeriodType):
    """
    Returns a cached or freshly generated transit recommendation.
    Cached if the same (user_id, period, date_from) already exists.
    """
    sb = get_supabase()
    date_from, date_to = get_period_dates(period)

    # ── 1. Cache lookup ───────────────────────────────────────────────────────
    cached = (
        sb.table("user_recommendations")
        .select("result")
        .eq("user_id", user_id)
        .eq("period", period)
        .eq("date_from", str(date_from))
        .limit(1)
        .execute()
    )
    if cached.data:
        return {"cached": True, "data": cached.data[0]["result"]}

    # ── 2. Birth data ─────────────────────────────────────────────────────────
    birth_resp = (
        sb.table("user_birth_data")
        .select("birth_date,birth_time,birth_place")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not birth_resp.data:
        raise HTTPException(404, "Birth data not found for this user")

    bd = birth_resp.data[0]

    # ── 3. Natal chart ────────────────────────────────────────────────────────
    try:
        chart = await calculate_chart(bd["birth_date"], bd["birth_time"], bd["birth_place"])
    except Exception as e:
        logger.error("Failed to calculate natal chart for %s: %s", user_id, e)
        raise HTTPException(500, "Failed to calculate natal chart")

    natal_planets = chart.get("planets", {})

    # ── 4. Transit scoring ────────────────────────────────────────────────────
    transit_data = calculate_transits(natal_planets=natal_planets, period=period)

    # ── 5. Portrait context ───────────────────────────────────────────────────
    portrait_resp = (
        sb.table("user_portraits")
        .select("core_archetype,energy_type,current_dynamic,narrative_role,core_identity")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    portrait_summary: dict = portrait_resp.data[0] if portrait_resp.data else {}

    # chain_narrative from sphere_context is expensive; use portrait summary as proxy
    chain_narrative = portrait_summary.get("core_identity", "")

    user_resp = (
        sb.table("users")
        .select("first_name")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    user_name = user_resp.data[0].get("first_name", "") if user_resp.data else ""

    # ── 6. LLM synthesis ──────────────────────────────────────────────────────
    result = await synthesize_recommendation(
        transit_data=transit_data,
        portrait_summary=portrait_summary,
        chain_narrative=chain_narrative,
        period=period,
        user_name=user_name,
    )

    # ── 7. Cache ──────────────────────────────────────────────────────────────
    try:
        sb.table("user_recommendations").upsert(
            {
                "user_id":   user_id,
                "period":    period,
                "date_from": str(date_from),
                "date_to":   str(date_to),
                "result":    result,
            },
            on_conflict="user_id,period,date_from",
        ).execute()
    except Exception as e:
        logger.warning("Failed to cache recommendation for %s: %s", user_id, e)

    return {"cached": False, "data": result}


@router.delete("/{user_id}/{period}")
async def invalidate_recommendation(user_id: str, period: PeriodType):
    """Force regeneration by clearing the cache for this period."""
    sb = get_supabase()
    date_from, _ = get_period_dates(period)
    sb.table("user_recommendations").delete().eq("user_id", user_id).eq("period", period).eq(
        "date_from", str(date_from)
    ).execute()
    return {"ok": True}
