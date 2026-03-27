from collections import defaultdict
from app.models.uis import UniversalInsight
from app.core.db import get_supabase
import logging

logger = logging.getLogger(__name__)

def synthesize(insights: list[UniversalInsight], system_name: str = "western_astrology") -> dict:
    level_order = {"high": 0, "medium": 1, "low": 2}

    # система → сфера → карточки
    result = defaultdict(lambda: defaultdict(list))
    for ins in insights:
        result[system_name][ins.primary_sphere].append(ins)

    # сортировка карточек внутри каждой сферы
    for system in result:
        for sphere_id in result[system]:
            result[system][sphere_id].sort(
                key=lambda x: (level_order[x.influence_level], -x.weight)
            )

    return result

async def save_to_supabase(user_id: str, result: dict):
    """Saves the fully synthesized insights to the `user_insights` table"""
    supabase = get_supabase()
    rows = []
    
    for system, spheres in result.items():
        for sphere_id, insights in spheres.items():
            for rank, ins in enumerate(insights):
                rows.append({
                    "user_id":            user_id,
                    "system":             system,
                    "primary_sphere":     sphere_id,
                    "rank":               rank,          # позиция внутри сферы
                    **ins.model_dump()
                })
                
    try:
        # We delete existing insights for this user/system combo
        # so recalculations are clean rewrites.
        systems = list(result.keys())
        for sys in systems:
             supabase.table("user_insights").delete().eq("user_id", user_id).eq("system", sys).execute()

        # Insert new rows
        res = supabase.table("user_insights").insert(rows).execute()
        return res
    except Exception as e:
        logger.error(f"Failed to save insights to Supabase: {e}")
        raise e
