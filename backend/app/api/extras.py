"""
Stub endpoints for diary, game, and payments.
Returns minimal valid responses to prevent frontend 404 errors.
Full implementations are planned for future sprints.
"""
from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from app.core.db import get_supabase
from app.core.config import settings
import json
import logging
import httpx

logger = logging.getLogger(__name__)

OFFERS: dict[str, dict] = {
    "pack_300": {
        "id": "pack_300",
        "name": "Заряд Света",
        "description": "300 единиц энергии — моментальное пополнение",
        "energy": 300,
        "stars": 75,
    },
    "pack_500": {
        "id": "pack_500",
        "name": "Энергетический Импульс",
        "description": "500 единиц энергии — популярный выбор",
        "energy": 500,
        "stars": 118,
    },
    "pack_1000": {
        "id": "pack_1000",
        "name": "Квантовый Скачок",
        "description": "1000 единиц энергии — максимальный заряд",
        "energy": 1000,
        "stars": 225,
    },
    "pack_premium": {
        "id": "pack_premium",
        "name": "AVATAR Premium",
        "description": "Полный доступ ко всем 12 сферам и приоритетный ИИ",
        "energy": 0,
        "stars": 800,
    },
}

# ─── Game router ──────────────────────────────────────────────────────────────
game_router = APIRouter()

@game_router.get("/state")
async def get_game_state(user_id: str):
    """Returns game stats from users table."""
    try:
        supabase = get_supabase()
        res = supabase.table("users").select(
            "energy,streak,xp,evolution_level"
        ).eq("id", user_id).execute()

        if res.data:
            u = res.data[0]
            xp = u.get("xp", 0)
            level = u.get("evolution_level", 1)
            xp_next = level * 1000  # simple progression: level N requires N*1000 total xp
            return {
                "energy": u.get("energy", 100),
                "streak": u.get("streak", 0),
                "xp": xp,
                "xp_current": xp % 1000,
                "xp_next": xp_next,
                "evolution_level": level,
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
        res = supabase.table("user_memory").select("id,message,created_at")\
            .eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()

        return [
            {
                "id": row["id"],
                "content": row["message"],
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
    return {"offers": list(OFFERS.values())}


@payments_router.post("/invoice")
async def create_invoice(request: Request):
    body = await request.json()
    user_id = body.get("user_id")
    offer_id = body.get("offer_id")

    if offer_id not in OFFERS:
        raise HTTPException(status_code=400, detail=f"Unknown offer: {offer_id}")

    offer = OFFERS[offer_id]
    payload = json.dumps({"user_id": user_id, "offer_id": offer_id})

    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(status_code=500, detail="Bot token not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{token}/createInvoiceLink",
            json={
                "title": offer["name"],
                "description": offer["description"],
                "payload": payload,
                "provider_token": "",
                "currency": "XTR",
                "prices": [{"label": offer["name"], "amount": offer["stars"]}],
            },
        )

    data = resp.json()
    if not data.get("ok"):
        logger.error(f"Telegram createInvoiceLink error: {data}")
        raise HTTPException(status_code=500, detail=data.get("description", "Telegram error"))

    return {"invoice_link": data["result"], "status": "created"}
