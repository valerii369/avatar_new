from collections import defaultdict
from app.models.uis import UniversalInsight
from app.core.db import get_supabase
from app.core.config import settings
import logging
import json
import openai

logger = logging.getLogger(__name__)

LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}


def synthesize(insights: list[UniversalInsight]) -> dict:
    """
    Layer 3: Groups insights by system → primary_sphere, sorts by influence.
    Uses ins.system from each insight (defaults to 'western_astrology').
    Returns: { system_name: { sphere_id: [UniversalInsight, ...] } }
    """
    result: dict = defaultdict(lambda: defaultdict(list))

    for ins in insights:
        result[ins.system][ins.primary_sphere].append(ins)

    for system in result:
        for sphere_id in result[system]:
            result[system][sphere_id].sort(
                key=lambda x: (LEVEL_ORDER[x.influence_level], -x.weight)
            )

    return result


async def generate_portrait_summary(user_id: str, synthesized_data: dict) -> dict:
    """
    Generates a high-level character portrait summary using GPT-4o-mini
    based on the top synthesized insights (top-2 per sphere, high-influence first).
    """
    top_insights = []
    for system in synthesized_data:
        for sphere_id in synthesized_data[system]:
            for item in synthesized_data[system][sphere_id][:2]:
                top_insights.append({
                    "sphere":  item.primary_sphere,
                    "theme":   item.core_theme,
                    "energy":  item.energy_description,
                    "weight":  item.weight,
                })

    prompt = f"""You are the AVATAR Synthesis Engine.
Based on the following astrological insights, generate a cohesive character portrait.
Respond in STRICT JSON format only, no extra text.

Insights:
{json.dumps(top_insights, ensure_ascii=False)}

Required JSON structure:
{{
    "core_identity":    "1-sentence soul essence",
    "core_archetype":   "creative title (e.g. The Cosmic Architect)",
    "narrative_role":   "their role in the universal play",
    "energy_type":      "dominant vibration description",
    "current_dynamic":  "what they are currently integrating or facing",
    "polarities": {{
        "core_strengths":  ["strength 1", "strength 2", "strength 3"],
        "shadow_aspects":  ["shadow 1", "shadow 2", "shadow 3"]
    }}
}}"""

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a master of psychological and evolutionary astrology."},
                {"role": "user",   "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"Failed to generate portrait summary: {e}")
        return {
            "core_identity":   "Путь исследования и трансформации",
            "core_archetype":  "Странник",
            "narrative_role":  "Искатель истины",
            "energy_type":     "Сбалансированная",
            "current_dynamic": "Ожидание активации",
            "polarities":      {"core_strengths": [], "shadow_aspects": []}
        }


async def save_to_supabase(user_id: str, result: dict, portrait: dict | None = None):
    """
    Saves synthesized insights + portrait summary to Supabase.
    Performs a clean rewrite per system (DELETE → INSERT).
    """
    supabase = get_supabase()

    # Build rows — exclude 'system' from model_dump since it's already the loop key
    rows = []
    for system, spheres in result.items():
        for sphere_id, insights in spheres.items():
            for rank, ins in enumerate(insights):
                dump = ins.model_dump(exclude={"system"})
                rows.append({
                    "user_id":        user_id,
                    "system":         system,
                    "primary_sphere": sphere_id,
                    "rank":           rank,
                    **dump,
                })

    try:
        # Clean rewrite per system
        for system in result.keys():
            supabase.table("user_insights").delete()\
                .eq("user_id", user_id).eq("system", system).execute()

        if rows:
            supabase.table("user_insights").insert(rows).execute()

        # Portrait summary
        if portrait:
            portrait_row = {
                "user_id":          user_id,
                "core_identity":    portrait.get("core_identity", ""),
                "core_archetype":   portrait.get("core_archetype", ""),
                "narrative_role":   portrait.get("narrative_role", ""),
                "energy_type":      portrait.get("energy_type", ""),
                "current_dynamic":  portrait.get("current_dynamic", ""),
                "deep_profile_data": {"polarities": portrait.get("polarities", {})},
            }
            supabase.table("user_portraits").delete().eq("user_id", user_id).execute()
            supabase.table("user_portraits").insert(portrait_row).execute()

        logger.info(f"Saved {len(rows)} insights + portrait for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save insights to Supabase for {user_id}: {e}")
        raise
