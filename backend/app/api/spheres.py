"""
/api/spheres — Sphere-On-Demand API

GET  /api/spheres/access/{user_id}      — какие сферы открыты
POST /api/spheres/{sphere_num}/unlock   — разблокировать сферу (+ запуск расчёта)

Requires Supabase table:
  user_sphere_access(id uuid, user_id uuid, sphere_num int, payment_id text, unlocked_at timestamptz)
"""
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from app.core.db import get_supabase
from app.services.dsb.natal_chart import calculate_chart
from app.services.dsb.sphere_agent import compute_sphere

logger = logging.getLogger(__name__)
router = APIRouter()

FREE_SPHERES = [1, 10]  # Личность + Карьера всегда бесплатно


# ─── Models ───────────────────────────────────────────────────────────────────

class UnlockRequest(BaseModel):
    user_id: str
    payment_id: str | None = None  # заглушка, будет заполнена при интеграции платежей


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/access/{user_id}")
async def get_sphere_access(user_id: str):
    """Return which spheres are unlocked for a user."""
    supabase = get_supabase()
    try:
        r = supabase.table("user_sphere_access")\
            .select("sphere_num")\
            .eq("user_id", user_id)\
            .execute()
        unlocked = {row["sphere_num"] for row in (r.data or [])}
        unlocked |= set(FREE_SPHERES)
        locked = [s for s in range(1, 13) if s not in unlocked]
        return {
            "unlocked": sorted(unlocked),
            "locked": locked,
            "free_spheres": FREE_SPHERES,
        }
    except Exception as e:
        logger.error(f"get_sphere_access failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sphere access")


@router.post("/{sphere_num}/unlock")
async def unlock_sphere(
    sphere_num: int,
    req: UnlockRequest,
    background_tasks: BackgroundTasks,
):
    """
    Unlock a sphere for a user and trigger background compute.
    Payment verification stub — add real check here before recording unlock.
    """
    if sphere_num not in range(1, 13):
        raise HTTPException(status_code=400, detail="sphere_num must be 1–12")

    supabase = get_supabase()

    # Already unlocked?
    existing = supabase.table("user_sphere_access")\
        .select("sphere_num")\
        .eq("user_id", req.user_id)\
        .eq("sphere_num", sphere_num)\
        .execute()
    if existing.data:
        return {"status": "already_unlocked", "sphere_num": sphere_num}

    # TODO: verify payment_id via payment provider before proceeding

    try:
        supabase.table("user_sphere_access").insert({
            "user_id": req.user_id,
            "sphere_num": sphere_num,
            "payment_id": req.payment_id,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to record sphere unlock for user {req.user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record unlock")

    background_tasks.add_task(_bg_compute_sphere, req.user_id, sphere_num)

    return {"status": "unlocked", "sphere_num": sphere_num, "computing": True}


# ─── Background compute ───────────────────────────────────────────────────────

async def _bg_compute_sphere(user_id: str, sphere_num: int):
    """Fetch birth data → compute chart → compute sphere insights."""
    supabase = get_supabase()
    try:
        bd = supabase.table("user_birth_data")\
            .select("birth_date,birth_time,birth_place")\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        if not bd.data:
            logger.error(f"No birth data for user {user_id}, cannot compute sphere {sphere_num}")
            return
        d = bd.data
        chart = await calculate_chart(d["birth_date"], d["birth_time"], d["birth_place"])
        await compute_sphere(sphere_num, chart, user_id, save=True)
    except Exception as e:
        logger.error(f"bg_compute_sphere {sphere_num} failed for user {user_id}: {e}")
