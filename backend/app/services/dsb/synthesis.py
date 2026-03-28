from collections import defaultdict
from app.models.uis import UniversalInsight
from app.core.db import get_supabase
import logging
from app.core.config import settings
import json
import openai

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

async def generate_portrait_summary(user_id: str, synthesized_data: dict) -> dict:
    """
    Generates a high-level character portrait summary using GPT-4o-mini
    based on the top synthesized insights.
    """
    # Collect top insights for prompt context
    top_insights = []
    for system in synthesized_data:
        for sphere_id in synthesized_data[system]:
            # Take top 2 high-influence items per sphere to avoid token bloat
            sphere_items = synthesized_data[system][sphere_id][:2]
            for item in sphere_items:
                top_insights.append({
                    "sphere": item.primary_sphere,
                    "theme": item.core_theme,
                    "energy": item.energy_description
                })

    prompt = f"""
    You are the AVATAR Synthesis Engine. 
    Based on the following astrological insights, generate a cohesive character portrait.
    Provide the response in STRICT JSON format.

    Insights:
    {json.dumps(top_insights, ensure_ascii=False)}

    JSON Structure:
    {{
        "core_identity": "A 1-sentence powerful description of the soul's essence",
        "core_archetype": "A creative title (e.g. The Cosmic Architect)",
        "narrative_role": "Their role in the social/universal play",
        "energy_type": "Description of their dominant vibration",
        "current_dynamic": "What they are currently integrating or facing",
        "polarities": {{
            "core_strengths": ["list of 3 key strengths"],
            "shadow_aspects": ["list of 3 key shadow traits"]
        }}
    }}
    """

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    try:
        response = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": "You are a master of psychological and evolutionary astrology."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        summary = json.loads(response.choices[0].message.content)
        return summary
    except Exception as e:
        logger.error(f"Failed to generate portrait summary: {e}")
        return {
            "core_identity": "Путь исследования и трансформации",
            "core_archetype": "Странник",
            "narrative_role": "Искатель истины",
            "energy_type": "Сбалансированная",
            "current_dynamic": "Ожидание активации",
            "polarities": {"core_strengths": [], "shadow_aspects": []}
        }

async def save_to_supabase(user_id: str, result: dict, portrait: dict = None):
    """Saves the fully synthesized insights and optional portrait summary to Supabase"""
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
        supabase.table("user_insights").insert(rows).execute()

        # Handle Portrait Summary
        if portrait:
            portrait_row = {
                "user_id": user_id,
                "core_identity": portrait.get("core_identity", ""),
                "core_archetype": portrait.get("core_archetype", ""),
                "narrative_role": portrait.get("narrative_role", ""),
                "energy_type": portrait.get("energy_type", ""),
                "current_dynamic": portrait.get("current_dynamic", ""),
                "deep_profile_data": {"polarities": portrait.get("polarities", {})}
            }
            supabase.table("user_portraits").delete().eq("user_id", user_id).execute()
            supabase.table("user_portraits").insert(portrait_row).execute()

        return True
    except Exception as e:
        logger.error(f"Failed to save insights to Supabase: {e}")
        raise e
