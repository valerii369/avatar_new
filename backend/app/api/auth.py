from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.dsb.natal_chart import calculate_chart
from app.services.dsb.western_astrology_agent import generate_insights
from app.services.dsb.synthesis import synthesize, save_to_supabase, generate_portrait_summary
from app.core.db import get_supabase
from app.core.config import settings
import logging
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Request / Response models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    tg_id: int
    first_name: str
    last_name:  Optional[str] = ""
    username:   Optional[str] = ""
    photo_url:  Optional[str] = ""

class ProfileRequest(BaseModel):
    user_id:     str
    birth_date:  str   # YYYY-MM-DD
    birth_time:  str   # HH:MM
    birth_place: str
    gender:      Optional[str] = "male"

class GeocodeRequest(BaseModel):
    place: str

# ─── Helpers ───────────────────────────────────────────────────────────────────

def _default_user_fields() -> dict:
    return {
        "xp":             0,
        "xp_current":     0,
        "xp_next":        1000,
        "evolution_level": 1,
        "title":          "Новичок",
        "energy":         100,
        "streak":         0,
        "referral_code":  "",
        "onboarding_done": False,
    }

# ─── /geocode ─────────────────────────────────────────────────────────────────

@router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """Geocode a city using Supabase cache + Nominatim fallback."""
    supabase = get_supabase()

    cached = supabase.table("geocode_cache").select("*").eq("city_name", request.place).execute()
    if cached.data:
        return cached.data[0]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": request.place, "format": "json", "limit": 1},
                headers={"User-Agent": "AVATAR-App/2.1"}
            )
            data = resp.json()
            if not data:
                raise HTTPException(status_code=404, detail="Location not found")

            from timezonefinder import TimezoneFinder
            tf = TimezoneFinder()
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            tz  = tf.timezone_at(lat=lat, lng=lon) or "UTC"

            result = {"city_name": request.place, "lat": lat, "lon": lon, "timezone": tz}
            supabase.table("geocode_cache").insert(result).execute()
            return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Geocoding failed: {e}")
        raise HTTPException(status_code=500, detail="Geocoding service error")

# ─── /login ───────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(request: LoginRequest):
    """
    Upserts user by tg_id in the 'users' table.
    Returns full user profile from DB.
    """
    supabase = get_supabase()

    try:
        existing = supabase.table("users").select("*").eq("tg_id", str(request.tg_id)).execute()

        if existing.data:
            user = existing.data[0]
            # Update name/photo if changed
            supabase.table("users").update({
                "first_name": request.first_name,
                "last_name":  request.last_name,
                "username":   request.username,
                "photo_url":  request.photo_url,
            }).eq("tg_id", str(request.tg_id)).execute()
        else:
            defaults = _default_user_fields()
            new_user = {
                "tg_id":      str(request.tg_id),
                "first_name": request.first_name,
                "last_name":  request.last_name,
                "username":   request.username,
                "photo_url":  request.photo_url,
                **defaults,
            }
            res = supabase.table("users").insert(new_user).execute()
            user = res.data[0] if res.data else new_user

        return {
            "user_id":        user.get("id") or user.get("tg_id"),
            "tg_id":          request.tg_id,
            "first_name":     user.get("first_name", request.first_name),
            "token":          f"tg_{request.tg_id}",   # JWT / Supabase token в проде
            "energy":         user.get("energy", 100),
            "streak":         user.get("streak", 0),
            "evolution_level": user.get("evolution_level", 1),
            "title":          user.get("title", "Новичок"),
            "onboarding_done": user.get("onboarding_done", False),
            "xp":             user.get("xp", 0),
            "xp_current":     user.get("xp_current", 0),
            "xp_next":        user.get("xp_next", 1000),
            "referral_code":  user.get("referral_code", ""),
            "photo_url":      user.get("photo_url", ""),
        }

    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

# ─── /profile (GET) ───────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(user_id: str):
    """Returns user profile from DB including birth data and onboarding status."""
    supabase = get_supabase()

    try:
        user_res = supabase.table("users").select("*").eq("id", user_id).execute()
        if not user_res.data:
            # Fallback: try by tg_id
            user_res = supabase.table("users").select("*").eq("tg_id", user_id).execute()

        user = user_res.data[0] if user_res.data else {}

        # Read birth data
        birth_res = supabase.table("user_birth_data").select("*").eq("user_id", user_id).execute()
        birth = birth_res.data[0] if birth_res.data else {}

        # Check onboarding
        portrait_res = supabase.table("user_portraits").select("user_id").eq("user_id", user_id).execute()
        onboarding_done = bool(portrait_res.data)

        return {
            "user_id":        user_id,
            "first_name":     user.get("first_name", ""),
            "onboarding_done": onboarding_done,
            "birth_date":     birth.get("birth_date", ""),
            "birth_place":    birth.get("birth_place", ""),
            "xp":             user.get("xp", 0),
            "xp_current":     user.get("xp_current", 0),
            "xp_next":        user.get("xp_next", 1000),
            "evolution_level": user.get("evolution_level", 1),
            "title":          user.get("title", "Новичок"),
            "energy":         user.get("energy", 100),
            "streak":         user.get("streak", 0),
        }

    except Exception as e:
        logger.error(f"Get profile failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")

# ─── DSB Pipeline background task ────────────────────────────────────────────

async def initialize_onboarding_layer(req: ProfileRequest):
    """Full 3-layer DSB Pipeline as background task."""
    logger.info(f"Starting DSB Pipeline for user: {req.user_id}")
    supabase = get_supabase()

    try:
        # Save birth data
        birth_row = {
            "user_id":     req.user_id,
            "birth_date":  req.birth_date,
            "birth_time":  req.birth_time,
            "birth_place": req.birth_place,
            "gender":      req.gender,
        }
        supabase.table("user_birth_data").delete().eq("user_id", req.user_id).execute()
        supabase.table("user_birth_data").insert(birth_row).execute()

        # Layer 1 — Astro chart
        astro_chart = await calculate_chart(req.birth_date, req.birth_time, req.birth_place)

        # Layer 2 — RAG + GPT-4o insights
        uis_response = await generate_insights(astro_chart)

        # Layer 3 — Synthesis
        synthesized_data = synthesize(uis_response.insights)

        # Layer 4 — Portrait summary
        portrait = await generate_portrait_summary(req.user_id, synthesized_data)

        # Save everything
        await save_to_supabase(req.user_id, synthesized_data, portrait)

        # Mark onboarding done
        supabase.table("users").update({"onboarding_done": True})\
            .eq("id", req.user_id).execute()

        logger.info(f"DSB Pipeline completed for user: {req.user_id}")

    except Exception as e:
        logger.error(f"DSB Pipeline failed for user {req.user_id}: {e}")
        # Log to uis_errors
        try:
            supabase.table("uis_errors").insert({
                "user_id":       req.user_id,
                "raw_response":  "",
                "error_message": str(e),
                "attempt":       0,
            }).execute()
        except Exception:
            pass

# ─── /calculate ───────────────────────────────────────────────────────────────

@router.post("/calculate")
async def calculate_profile(request: ProfileRequest, background_tasks: BackgroundTasks):
    """Triggers the DSB Pipeline as a background task."""
    try:
        background_tasks.add_task(initialize_onboarding_layer, request)
        return {"status": "processing", "message": "DSB Pipeline initialized"}
    except Exception as e:
        logger.error(str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")
