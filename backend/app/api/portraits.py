from fastapi import APIRouter, HTTPException
from collections import defaultdict
from app.core.db import get_supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{user_id}")
async def get_portrait(user_id: str):
    """
    Fetches both the synthesized 12-sphere insights and the portrait summary
    from Supabase for the Frontend MasterHubView.
    """
    try:
        supabase = get_supabase()
        
        # 1. Fetch 12-Sphere Insights
        insights_resp = supabase.table("user_insights").select("*").eq("user_id", user_id).order("system").order("primary_sphere").order("rank").execute()
        
        # 2. Fetch Portrait Summary
        portrait_resp = supabase.table("user_portraits").select("*").eq("user_id", user_id).execute()
        
        if not insights_resp.data and not portrait_resp.data:
            return {"status": "pending", "message": "Portrait is still calculating or not requested"}

        # Group insights by system and sphere
        spheres = defaultdict(lambda: defaultdict(list))
        for row in insights_resp.data:
            sys = row["system"]
            sphere = row["primary_sphere"]
            insight = {
                "primary_sphere":     row["primary_sphere"],
                "influence_level":    row["influence_level"],
                "weight":             row["weight"],
                "position":           row["position"],
                "core_theme":         row["core_theme"],
                # DB column is "description"; expose as "energy_description" for frontend compat
                "energy_description": row.get("description") or row.get("energy_description", ""),
                "light_aspect":       row["light_aspect"],
                "shadow_aspect":      row["shadow_aspect"],
                "developmental_task": row["developmental_task"],
                "integration_key":    row["integration_key"],
                "triggers":           row["triggers"],
                "source":             row.get("source"),
                # Extended fields saved by the sphere worker
                "insight":            row.get("insight"),
                "gift":               row.get("gift"),
            }
            spheres[sys][str(sphere)].append(insight)

        # Construct final hub object
        portrait_data = portrait_resp.data[0] if portrait_resp.data else None
        
        # We assume 'western_astrology' as the primary system for now
        # matching the frontend expectation of a unified hub object
        hub = {
            "insights": {sys: dict(sph) for sys, sph in spheres.items()},
            "portrait_summary": {
                "core_identity":   portrait_data.get("core_identity")   if portrait_data else "Инициация...",
                "core_archetype":  portrait_data.get("core_archetype")  if portrait_data else "Странник",
                "narrative_role":  portrait_data.get("narrative_role")  if portrait_data else "Искатель",
                "energy_type":     portrait_data.get("energy_type")     if portrait_data else "Неопределена",
                "current_dynamic": portrait_data.get("current_dynamic") if portrait_data else "Трансформация",
            } if portrait_data else None,
            "deep_profile_data":      portrait_data.get("deep_profile_data")      if portrait_data else None,
            "sphere_summaries":       portrait_data.get("sphere_summaries") or {}  if portrait_data else {},
            "active_spheres_count":   portrait_data.get("active_spheres_count", 0) if portrait_data else 0,
            "master_portrait":        portrait_data.get("master_portrait")          if portrait_data else None,
        }

        return hub
    except Exception as e:
        logger.error(f"Error fetching portrait for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching portrait data")
