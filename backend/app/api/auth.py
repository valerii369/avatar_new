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
import time

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
            # Chat-context profile fields
            "chat_onboarding_completed": user.get("chat_onboarding_completed", False),
            "current_location":          user.get("current_location"),
            "work_sphere":               user.get("work_sphere"),
            "work_satisfaction":         user.get("work_satisfaction"),
            "relationship_status":       user.get("relationship_status"),
            "life_focus":                user.get("life_focus"),
        }

    except Exception as e:
        logger.error(f"Get profile failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")

# ─── /reset ──────────────────────────────────────────────────────────────────

class ResetRequest(BaseModel):
    user_id: Optional[str] = None
    tg_id: Optional[int] = None
    clear_geocode: Optional[bool] = False

@router.post("/reset")
async def reset_user(request: ResetRequest):
    """
    Hard reset user data by user_id and/or tg_id:
    - user_birth_data, user_insights, user_portraits, user_memory, uis_errors, retriever_traces
    - users flags/stats reset to defaults
    - optional geocode_cache cleanup by user's birth_place values
    """
    supabase = get_supabase()

    # Resolve user row (prefer exact id, fallback tg_id)
    user_row = None
    if request.user_id:
        by_id = supabase.table("users").select("id,tg_id").eq("id", request.user_id).execute()
        if by_id.data:
            user_row = by_id.data[0]

    if not user_row and request.tg_id is not None:
        by_tg = supabase.table("users").select("id,tg_id").eq("tg_id", str(request.tg_id)).execute()
        if by_tg.data:
            user_row = by_tg.data[0]

    if not user_row:
        raise HTTPException(status_code=404, detail="User not found for provided user_id/tg_id")

    resolved_user_id = str(user_row["id"])
    resolved_tg_id = str(user_row["tg_id"])
    # Some legacy rows may store tg_id in user_id field, so clear both variants.
    user_variants = list({resolved_user_id, resolved_tg_id})

    try:
        birth_places: set[str] = set()
        for uid in user_variants:
            birth_rows = supabase.table("user_birth_data").select("birth_place").eq("user_id", uid).execute()
            for row in (birth_rows.data or []):
                place = (row.get("birth_place") or "").strip()
                if place:
                    birth_places.add(place)

        for uid in user_variants:
            supabase.table("user_insights").delete().eq("user_id", uid).execute()
            supabase.table("user_portraits").delete().eq("user_id", uid).execute()
            supabase.table("user_birth_data").delete().eq("user_id", uid).execute()
            supabase.table("user_memory").delete().eq("user_id", uid).execute()
            supabase.table("uis_errors").delete().eq("user_id", uid).execute()
            supabase.table("retriever_traces").delete().eq("user_id", uid).execute()

        if request.clear_geocode:
            for place in birth_places:
                supabase.table("geocode_cache").delete().eq("city_name", place).execute()

        supabase.table("users").update({
            "onboarding_done": False,
            **_default_user_fields(),
        }).eq("id", resolved_user_id).execute()

        return {
            "status": "ok",
            "message": "User reset completed",
            "resolved_user_id": resolved_user_id,
            "resolved_tg_id": resolved_tg_id,
            "cleared_user_ids": user_variants,
            "geocode_cleared": bool(request.clear_geocode),
            "cleared_places": sorted(list(birth_places)) if request.clear_geocode else [],
        }
    except Exception as e:
        logger.error(f"Reset failed for user_id={resolved_user_id}, tg_id={resolved_tg_id}: {e}")
        raise HTTPException(status_code=500, detail="Reset failed")


# ─── DSB Pipeline background task ────────────────────────────────────────────

async def initialize_onboarding_layer(req: ProfileRequest):
    """Onboarding: chart + 2 free spheres (Личность + Ресурсы) + portrait."""
    logger.info(f"Starting onboarding pipeline for user: {req.user_id}")
    supabase = get_supabase()
    t_total = time.perf_counter()

    FREE_SPHERES = [1, 2]  # Личность + Ресурсы — free on onboarding

    try:
        # Save birth data
        t_birth = time.perf_counter()
        birth_row = {
            "user_id":     req.user_id,
            "birth_date":  req.birth_date,
            "birth_time":  req.birth_time,
            "birth_place": req.birth_place,
            "gender":      req.gender,
        }
        supabase.table("user_birth_data").delete().eq("user_id", req.user_id).execute()
        supabase.table("user_birth_data").insert(birth_row).execute()
        logger.info(f"[TIMING] onboarding.birth_data_save={time.perf_counter() - t_birth:.2f}s user={req.user_id}")

        # Layer 1 — Astro chart
        t_chart = time.perf_counter()
        astro_chart = await calculate_chart(req.birth_date, req.birth_time, req.birth_place)
        logger.info(f"[TIMING] onboarding.layer1_chart={time.perf_counter() - t_chart:.2f}s user={req.user_id}")

        # Layer 2 — Generate only free spheres (per-sphere agents)
        from app.services.dsb.western_astrology_agent import generate_sphere_insights
        all_insights = []
        for sphere_id in FREE_SPHERES:
            t_sphere = time.perf_counter()
            insights = await generate_sphere_insights(astro_chart, sphere_id, user_id=req.user_id)
            all_insights.extend(insights)
            logger.info(f"Free sphere {sphere_id}: {len(insights)} insights")
            logger.info(f"[TIMING] onboarding.layer2_sphere_{sphere_id}={time.perf_counter() - t_sphere:.2f}s user={req.user_id}")

        # Layer 3 — Synthesis
        t_synth = time.perf_counter()
        synthesized_data = synthesize(all_insights)
        logger.info(f"[TIMING] onboarding.layer3_synthesis={time.perf_counter() - t_synth:.2f}s user={req.user_id}")

        # Layer 4 — Portrait summary (based on available spheres)
        t_portrait = time.perf_counter()
        portrait = await generate_portrait_summary(req.user_id, synthesized_data)
        logger.info(f"[TIMING] onboarding.layer4_portrait={time.perf_counter() - t_portrait:.2f}s user={req.user_id}")

        # Save everything
        t_save = time.perf_counter()
        await save_to_supabase(req.user_id, synthesized_data, portrait)
        logger.info(f"[TIMING] onboarding.layer5_save={time.perf_counter() - t_save:.2f}s user={req.user_id}")

        # Mark onboarding done
        t_done = time.perf_counter()
        supabase.table("users").update({"onboarding_done": True})\
            .eq("id", req.user_id).execute()
        logger.info(f"[TIMING] onboarding.mark_done={time.perf_counter() - t_done:.2f}s user={req.user_id}")

        logger.info(f"DSB Pipeline completed for user: {req.user_id}")
        logger.info(f"[TIMING] onboarding.total={time.perf_counter() - t_total:.2f}s user={req.user_id}")

    except Exception as e:
        logger.error(f"DSB Pipeline failed for user {req.user_id}: {e}")
        # Roll back onboarding flag so frontend can return user to onboarding.
        try:
            supabase.table("users").update({"onboarding_done": False})\
                .eq("id", req.user_id).execute()
        except Exception as rollback_err:
            logger.error(f"Failed to rollback onboarding_done for {req.user_id}: {rollback_err}")
        # Log to uis_errors
        try:
            supabase.table("uis_errors").insert({
                "user_id":       req.user_id,
                "raw_response":  "",
                "error_message": str(e),
            }).execute()
        except Exception:
            pass

# ─── /generate-sphere — per-sphere agent ──────────────────────────────────────

class GenerateSphereRequest(BaseModel):
    user_id: str
    sphere_id: int

@router.post("/generate-sphere")
async def generate_sphere(request: GenerateSphereRequest):
    """Generate insights for a single sphere. Costs 10 energy."""
    supabase = get_supabase()

    if request.sphere_id < 1 or request.sphere_id > 12:
        raise HTTPException(status_code=400, detail="sphere_id must be 1-12")

    # Check user exists and has energy
    user_resp = supabase.table("users").select("id,energy").eq("id", request.user_id).execute()
    if not user_resp.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_resp.data[0]
    if user["energy"] < 10:
        raise HTTPException(status_code=402, detail="Not enough energy (need 10)")

    # Delete existing insights for this sphere (allows re-generation)
    supabase.table("user_insights")\
        .delete()\
        .eq("user_id", request.user_id)\
        .eq("primary_sphere", request.sphere_id)\
        .execute()

    # Get birth data for chart calculation
    birth_resp = supabase.table("user_birth_data").select("*").eq("user_id", request.user_id).execute()
    if not birth_resp.data:
        raise HTTPException(status_code=400, detail="No birth data — complete onboarding first")

    birth = birth_resp.data[0]

    try:
        # Layer 1: Calculate chart
        astro_chart = await calculate_chart(birth["birth_date"], birth["birth_time"], birth["birth_place"])

        # Layer 2: Per-sphere agent
        from app.services.dsb.western_astrology_agent import generate_sphere_insights
        insights = await generate_sphere_insights(astro_chart, request.sphere_id, user_id=request.user_id)

        if not insights:
            raise HTTPException(status_code=500, detail="No insights generated")

        # Save insights to Supabase
        for rank, ins in enumerate(insights, start=1):
            row = ins.model_dump()
            row["user_id"] = request.user_id
            row["system"] = "western_astrology"
            row["rank"] = rank
            supabase.table("user_insights").insert(row).execute()

        # Deduct energy
        supabase.table("users").update({"energy": user["energy"] - 10})\
            .eq("id", request.user_id).execute()

        return {
            "status": "ok",
            "sphere_id": request.sphere_id,
            "insights_count": len(insights),
            "energy_spent": 10,
            "energy_remaining": user["energy"] - 10,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"generate_sphere failed for user {request.user_id}, sphere {request.sphere_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)[:100]}")


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

# ─── /location ────────────────────────────────────────────────────────────────

class UpdateLocationRequest(BaseModel):
    user_id: str
    current_location: str

@router.post("/location")
async def update_location(request: UpdateLocationRequest):
    """Update user's current location (city/country) for transit calculations."""
    supabase = get_supabase()
    try:
        supabase.table("users").update(
            {"current_location": request.current_location}
        ).eq("id", request.user_id).execute()
        return {"ok": True, "current_location": request.current_location}
    except Exception as e:
        logger.error(f"update_location failed for {request.user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update location")


# ─── /referrals ───────────────────────────────────────────────────────────────

@router.get("/referrals")
async def get_referrals(user_id: str):
    """Returns users who registered via this user's referral_code."""
    supabase = get_supabase()
    try:
        # Get current user's referral_code
        user_res = supabase.table("users").select("referral_code").eq("id", user_id).execute()
        if not user_res.data or not user_res.data[0].get("referral_code"):
            return []

        ref_code = user_res.data[0]["referral_code"]
        # Find users who used this referral code (stored in referral_code field as "used:CODE")
        # For now return empty list — referral tracking will be implemented in a future sprint
        return []
    except Exception as e:
        logger.error(f"get_referrals failed for user {user_id}: {e}")
        return []


# ─── /calculate ───────────────────────────────────────────────────────────────

@router.post("/calculate-sync")
async def calculate_sync(request: ProfileRequest):
    """Runs DSB Pipeline synchronously for debugging — bypasses internal try/except."""
    import traceback
    supabase = get_supabase()
    steps = []
    try:
        # Step 1: Save birth data
        birth_row = {
            "user_id": request.user_id, "birth_date": request.birth_date,
            "birth_time": request.birth_time, "birth_place": request.birth_place, "gender": request.gender,
        }
        supabase.table("user_birth_data").delete().eq("user_id", request.user_id).execute()
        supabase.table("user_birth_data").insert(birth_row).execute()
        steps.append("birth_data: saved")

        # Step 2: Astro chart
        astro_chart = await calculate_chart(request.birth_date, request.birth_time, request.birth_place)
        steps.append(f"chart: {len(astro_chart.get('planets',{}))} planets, {len(astro_chart.get('aspects',[]))} aspects")

        # Step 3: Generate insights
        uis_response = await generate_insights(astro_chart, user_id=request.user_id)
        steps.append(f"insights: {len(uis_response.insights)} generated")

        # Step 4: Synthesis
        synthesized_data = synthesize(uis_response.insights)
        steps.append(f"synthesis: {len(synthesized_data)} items")

        # Step 5: Portrait
        portrait = await generate_portrait_summary(request.user_id, synthesized_data)
        steps.append(f"portrait: {bool(portrait)}")

        # Step 6: Save
        await save_to_supabase(request.user_id, synthesized_data, portrait)
        steps.append("saved to supabase")

        # Step 7: Mark onboarding done
        supabase.table("users").update({"onboarding_done": True}).eq("id", request.user_id).execute()
        steps.append("onboarding_done: True")

        return {"status": "done", "steps": steps}
    except Exception as e:
        steps.append(f"FAILED: {e}")
        return {"status": "error", "steps": steps, "error": str(e), "traceback": traceback.format_exc()}

@router.post("/calculate")
async def calculate_profile(request: ProfileRequest, background_tasks: BackgroundTasks):
    """Triggers the DSB Pipeline as a background task."""
    supabase = get_supabase()

    try:
        background_tasks.add_task(initialize_onboarding_layer, request)
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
        return {"status": "processing", "message": "DSB Pipeline initialized"}
    except Exception as e:
        logger.error(str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")
