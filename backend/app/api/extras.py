"""
Stub endpoints for diary, game, and payments.
Returns minimal valid responses to prevent frontend 404 errors.
Full implementations are planned for future sprints.
"""
from fastapi import APIRouter, Request
from typing import Optional
from app.core.db import get_supabase
import logging

logger = logging.getLogger(__name__)

# ─── Game router ──────────────────────────────────────────────────────────────
game_router = APIRouter()

@game_router.get("/state")
async def get_game_state(user_id: str):
    """Returns game stats from users table."""
    try:
        supabase = get_supabase()
        res = supabase.table("users").select(
            "energy,streak,xp,xp_current,xp_next,evolution_level"
        ).eq("id", user_id).execute()

        if res.data:
            u = res.data[0]
            return {
                "energy": u.get("energy", 100),
                "streak": u.get("streak", 0),
                "xp": u.get("xp", 0),
                "xp_current": u.get("xp_current", 0),
                "xp_next": u.get("xp_next", 1000),
                "evolution_level": u.get("evolution_level", 1),
            }
    except Exception as e:
        logger.error(f"Game state error: {e}")
    return {"energy": 100, "streak": 0, "xp": 0, "xp_current": 0, "xp_next": 1000, "evolution_level": 1}


# ─── Diary router ─────────────────────────────────────────────────────────────
diary_router = APIRouter()

@diary_router.get("")
async def list_diary(user_id: str, filter: Optional[str] = None, type: Optional[str] = None):
    """Returns diary entries from user_memory table."""
    try:
        supabase = get_supabase()
        res = supabase.table("user_memory").select("id,content,created_at")\
            .eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()

        return [
            {
                "id": row["id"],
                "content": row["content"],
                "created_at": row["created_at"],
                "integration_done": False,
                "system": "assistant",
                "primary_sphere": None,
            }
            for row in (res.data or [])
        ]
    except Exception as e:
        logger.error(f"Diary list error: {e}")
        return []


@diary_router.patch("/{entry_id}/integration")
async def update_integration(entry_id: str, request: Request):
    """Mark diary entry as integrated (stub — integration_done column not yet added)."""
    return {"status": "ok"}


# ─── Payments router ──────────────────────────────────────────────────────────
payments_router = APIRouter()

@payments_router.get("/offers")
async def get_offers():
    """Returns available subscription offers (stub)."""
    return {
        "offers": [
            {"id": "basic", "name": "AVATAR Basic", "price": 299, "currency": "RUB", "period": "month"},
            {"id": "pro",   "name": "AVATAR Pro",   "price": 799, "currency": "RUB", "period": "month"},
        ]
    }


@payments_router.post("/invoice")
async def create_invoice(request: Request):
    """Creates a payment invoice (stub)."""
    return {"status": "pending", "invoice_url": None}
