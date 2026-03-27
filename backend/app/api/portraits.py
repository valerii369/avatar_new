from fastapi import APIRouter, HTTPException
from collections import defaultdict
from app.core.db import get_supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{user_id}")
async def get_portrait(user_id: str):
    """
    Fetches the synthesized 12-sphere insights from Supabase 
    and returns them correctly grouped for the Frontend MasterHubView.
    """
    try:
        supabase = get_supabase()
        
        # Order by system, primary_sphere, then rank (ascending)
        resp = supabase.table("user_insights").select("*").eq("user_id", user_id).order("system").order("primary_sphere").order("rank").execute()
        
        if not resp.data:
            return {"status": "pending", "message": "Portrait is still calculating or not requested"}

        # Re-group by system and sphere to match expected frontend output structure
        result = defaultdict(lambda: defaultdict(list))
        for row in resp.data:
            sys = row["system"]
            sphere = row["primary_sphere"]
            # To output clean UniversalInsight objects without DB metadata:
            insight = {
                "primary_sphere": row["primary_sphere"],
                "influence_level": row["influence_level"],
                "weight": row["weight"],
                "position": row["position"],
                "core_theme": row["core_theme"],
                "energy_description": row["energy_description"],
                "light_aspect": row["light_aspect"],
                "shadow_aspect": row["shadow_aspect"],
                "developmental_task": row["developmental_task"],
                "integration_key": row["integration_key"],
                "triggers": row["triggers"],
                "source": row.get("source")
            }
            result[sys][str(sphere)].append(insight)

        return result
    except Exception as e:
        logger.error(f"Error fetching portrait for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching portrait data")
