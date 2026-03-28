from fastapi import APIRouter, HTTPException
from collections import defaultdict
from app.core.db import get_supabase
from app.services.dsb.sphere_agent import FREE_SPHERES, SPHERE_NAMES
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{user_id}")
async def get_portrait(user_id: str):
    """
    Returns full portrait for MasterHubView:
    - insights grouped by system → sphere (computed spheres only)
    - portrait_summary (core identity, archetype, etc.)
    - sphere_meta: {sphere_num: {summary, cross_sphere_links}} for free spheres
    - sphere_teasers: {sphere_num: teaser_text} for locked spheres
    - sphere_access: {unlocked: [...], locked: [...]}
    """
    try:
        supabase = get_supabase()

        # 1. Fetch insights + portrait in parallel
        insights_resp = supabase.table("user_insights")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("system").order("primary_sphere").order("rank")\
            .execute()

        portrait_resp = supabase.table("user_portraits")\
            .select("*")\
            .eq("user_id", user_id)\
            .execute()

        access_resp = supabase.table("user_sphere_access")\
            .select("sphere_num")\
            .eq("user_id", user_id)\
            .execute()

        if not insights_resp.data and not portrait_resp.data:
            return {"status": "pending", "message": "Portrait is still calculating"}

        # 2. Group insights
        spheres: dict = defaultdict(lambda: defaultdict(list))
        for row in (insights_resp.data or []):
            insight = {k: row[k] for k in [
                "primary_sphere", "influence_level", "weight", "position",
                "core_theme", "energy_description", "light_aspect", "shadow_aspect",
                "developmental_task", "integration_key", "triggers", "source",
            ] if k in row}
            spheres[row["system"]][str(row["primary_sphere"])].append(insight)

        # 3. Portrait data
        portrait_data = portrait_resp.data[0] if portrait_resp.data else None
        dpd: dict = (portrait_data.get("deep_profile_data") or {}) if portrait_data else {}

        # 4. Sphere access
        unlocked_paid = {row["sphere_num"] for row in (access_resp.data or [])}
        unlocked = sorted(unlocked_paid | FREE_SPHERES)
        locked = [s for s in range(1, 13) if s not in unlocked]

        # 5. Locked sphere cards with teasers
        teasers_raw: dict = dpd.get("sphere_teasers", {})
        locked_spheres_info = [
            {
                "sphere_num": s,
                "sphere_name": SPHERE_NAMES[s],
                "teaser": teasers_raw.get(str(s), ""),
                "locked": True,
            }
            for s in locked
        ]

        return {
            "insights": {sys: dict(sph) for sys, sph in spheres.items()},
            "portrait_summary": {
                "core_identity":   portrait_data.get("core_identity", "Инициация..."),
                "core_archetype":  portrait_data.get("core_archetype", "Странник"),
                "narrative_role":  portrait_data.get("narrative_role", "Искатель"),
                "energy_type":     portrait_data.get("energy_type", "Неопределена"),
                "current_dynamic": portrait_data.get("current_dynamic", "Трансформация"),
            } if portrait_data else None,
            "polarities": dpd.get("polarities", {}),
            "sphere_meta": dpd.get("sphere_meta", {}),   # {sphere_num: {summary, cross_sphere_links}}
            "sphere_access": {
                "unlocked": unlocked,
                "locked": locked,
                "free_spheres": sorted(FREE_SPHERES),
            },
            "locked_spheres": locked_spheres_info,       # cards with personalized teasers
        }

    except Exception as e:
        logger.error(f"Error fetching portrait for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching portrait data")
