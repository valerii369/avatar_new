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
    # Telegram Mini App format
    init_data:    Optional[str] = ""
    is_dev:       Optional[bool] = False
    test_user_id: Optional[int] = None
    # Direct format (fallback)
    tg_id:      Optional[int] = None
    first_name: Optional[str] = ""
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
    """Fields that exist in the Supabase 'users' table."""
    return {
        "xp":             0,
        "evolution_level": 1,
        "title":          "Новичок",
        "energy":         100,
        "streak":         0,
        "referral_code":  "",
        "onboarding_done": False,
    }

def _computed_xp_fields(user: dict) -> dict:
    """XP level boundaries computed from xp value (not stored in DB)."""
    xp = user.get("xp", 0)
    level = user.get("evolution_level", 1)
    xp_current = (level - 1) * 1000
    xp_next = level * 1000
    return {"xp_current": xp_current, "xp_next": xp_next}

# ─── /geocode ─────────────────────────────────────────────────────────────────

@router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """Geocode a city using Supabase cache + Nominatim fallback."""
    supabase = get_supabase()

    cached = supabase.table("geocode_cache").select("*").eq("city_name", request.place).execute()
    if cached.data:
        row = cached.data[0]
        # Normalize: add frontend-expected aliases
        row["place"]   = row.get("city_name", request.place)
        row["tz_name"] = row.get("timezone", "UTC")
        return row

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

            # Store in DB with original column names
            db_row = {"city_name": request.place, "lat": lat, "lon": lon, "timezone": tz}
            supabase.table("geocode_cache").insert(db_row).execute()
            # Return with frontend-expected aliases
            return {**db_row, "place": request.place, "tz_name": tz}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Geocoding failed: {e}")
        raise HTTPException(status_code=500, detail="Geocoding service error")

# ─── /login ───────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(request: LoginRequest):
    """
    Handles both TMA (init_data/is_dev) and direct (tg_id) login formats.
    Upserts user by tg_id in the 'users' table and returns full profile.
    """
    supabase = get_supabase()

    # Resolve tg_id from request format
    resolved_tg_id = request.tg_id
    resolved_first_name = request.first_name or ""
    resolved_last_name = request.last_name or ""
    resolved_username = request.username or ""
    resolved_photo_url = request.photo_url or ""

    if resolved_tg_id is None:
        if request.is_dev or request.test_user_id:
            # Dev mode: use test_user_id or generate a fixed dev ID
            resolved_tg_id = request.test_user_id or 999999999
            resolved_first_name = resolved_first_name or "Dev User"
        elif request.init_data:
            # Production: parse TMA init_data
            # Example: "user=%7B%22id%22%3A123%2C%22first_name%22%3A%22Alex%22%7D&..."
            import urllib.parse
            try:
                params = dict(urllib.parse.parse_qsl(request.init_data))
                import json as _json
                user_data = _json.loads(params.get("user", "{}"))
                resolved_tg_id = user_data.get("id", 0)
                resolved_first_name = user_data.get("first_name", "")
                resolved_last_name = user_data.get("last_name", "")
                resolved_username = user_data.get("username", "")
                resolved_photo_url = user_data.get("photo_url", "")
            except Exception:
                resolved_tg_id = 0

        if not resolved_tg_id:
            raise HTTPException(status_code=400, detail="Cannot resolve tg_id from request")

    try:
        existing = supabase.table("users").select("*").eq("tg_id", resolved_tg_id).execute()

        if existing.data:
            user = existing.data[0]
            supabase.table("users").update({
                "first_name": resolved_first_name,
                "last_name":  resolved_last_name,
                "username":   resolved_username,
                "photo_url":  resolved_photo_url,
            }).eq("tg_id", resolved_tg_id).execute()
        else:
            new_user = {
                "tg_id":      resolved_tg_id,
                "first_name": resolved_first_name,
                "last_name":  resolved_last_name,
                "username":   resolved_username,
                "photo_url":  resolved_photo_url,
                **_default_user_fields(),
            }
            res = supabase.table("users").insert(new_user).execute()
            if not res.data:
                raise Exception("Insert returned no data")
            user = res.data[0]

        return _build_login_response(user, resolved_tg_id, resolved_first_name)

    except Exception as e:
        logger.error(f"Login failed for tg_id={resolved_tg_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login failed: {e}")


def _build_login_response(user: dict, tg_id: int, first_name: str) -> dict:
    xp_fields = _computed_xp_fields(user)
    return {
        "user_id":         user.get("id") or str(tg_id),
        "tg_id":           tg_id,
        "first_name":      user.get("first_name", first_name),
        "token":           f"tg_{tg_id}",
        "energy":          user.get("energy", 100),
        "streak":          user.get("streak", 0),
        "evolution_level": user.get("evolution_level", 1),
        "title":           user.get("title", "Новичок"),
        "onboarding_done": user.get("onboarding_done", False),
        "xp":              user.get("xp", 0),
        "xp_current":      xp_fields["xp_current"],
        "xp_next":         xp_fields["xp_next"],
        "referral_code":   user.get("referral_code", ""),
        "photo_url":       user.get("photo_url", ""),
    }

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

        xp_fields = _computed_xp_fields(user)
        return {
            "user_id":        user_id,
            "first_name":     user.get("first_name", ""),
            "onboarding_done": onboarding_done,
            "birth_date":     birth.get("birth_date", ""),
            "birth_place":    birth.get("birth_place", ""),
            "xp":             user.get("xp", 0),
            "xp_current":     xp_fields["xp_current"],
            "xp_next":        xp_fields["xp_next"],
            "evolution_level": user.get("evolution_level", 1),
            "title":          user.get("title", "Новичок"),
            "energy":         user.get("energy", 100),
            "streak":         user.get("streak", 0),
        }

    except Exception as e:
        logger.error(f"Get profile failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")

# ─── /reset ──────────────────────────────────────────────────────────────────

class ResetRequest(BaseModel):
    user_id: Optional[str] = None
    tg_id: Optional[int] = None

@router.post("/reset")
async def reset_user(request: ResetRequest):
    """Reset user data: delete insights, portraits, birth data, memory. Reset onboarding flag."""
    supabase = get_supabase()

    # Resolve user_id
    user_id = request.user_id
    if not user_id and request.tg_id:
        res = supabase.table("users").select("id").eq("tg_id", request.tg_id).execute()
        if res.data:
            user_id = res.data[0]["id"]

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id or tg_id required")

    try:
        supabase.table("user_insights").delete().eq("user_id", user_id).execute()
        supabase.table("user_portraits").delete().eq("user_id", user_id).execute()
        supabase.table("user_birth_data").delete().eq("user_id", user_id).execute()
        supabase.table("user_memory").delete().eq("user_id", user_id).execute()
        supabase.table("users").update({
            "onboarding_done": False,
            **_default_user_fields(),
        }).eq("id", user_id).execute()

        return {"status": "ok", "message": f"User {user_id} reset"}
    except Exception as e:
        logger.error(f"Reset failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Reset failed")


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

# ─── /pipeline-errors (diagnostic) ────────────────────────────────────────────

@router.get("/pipeline-errors")
async def get_pipeline_errors(user_id: str = "", limit: int = 5):
    """Returns recent DSB pipeline errors from uis_errors table."""
    supabase = get_supabase()
    q = supabase.table("uis_errors").select("*").order("created_at", desc=True).limit(limit)
    if user_id:
        q = q.eq("user_id", user_id)
    resp = q.execute()
    return {"errors": resp.data}

# ─── /calculate ───────────────────────────────────────────────────────────────

@router.post("/calculate-sync")
async def calculate_sync(request: ProfileRequest):
    """Runs DSB Pipeline synchronously for debugging. Returns error details if it fails."""
    try:
        await initialize_onboarding_layer(request)
        return {"status": "done", "message": "Pipeline completed successfully"}
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

@router.post("/calculate")
async def calculate_profile(request: ProfileRequest, background_tasks: BackgroundTasks):
    """Triggers the DSB Pipeline as a background task."""
    supabase = get_supabase()

    # Mark onboarding as started immediately so the frontend
    # doesn't get redirected back to onboarding while pipeline runs.
    # user_id can be a UUID (id) or a tg_id — try both.
    try:
        import uuid as _uuid
        _uuid.UUID(str(request.user_id))
        # It's a valid UUID — update by id
        supabase.table("users").update({"onboarding_done": True})\
            .eq("id", request.user_id).execute()
    except (ValueError, AttributeError):
        # Not a UUID — must be tg_id
        try:
            supabase.table("users").update({"onboarding_done": True})\
                .eq("tg_id", request.user_id).execute()
        except Exception as e:
            logger.warning(f"Could not set onboarding_done for user {request.user_id}: {e}")

    try:
        background_tasks.add_task(initialize_onboarding_layer, request)
        return {"status": "processing", "message": "DSB Pipeline initialized"}
    except Exception as e:
        logger.error(str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")
