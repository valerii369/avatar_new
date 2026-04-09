from collections import defaultdict
from app.models.uis import UniversalInsight
from app.core.db import get_supabase
import logging
from app.core.config import settings
import json
import openai
import time

logger = logging.getLogger(__name__)


def _usage_to_dict(usage) -> dict:
    if not usage:
        return {}
    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }

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
                    "description": item.description,
                    "insight": item.insight,
                    "gift": item.gift
                })

    prompt = f"""
    Ты — движок синтеза AVATAR.
    На основе астрологических инсайтов составь целостный психологический портрет.
    ВЕСЬ ТЕКСТ СТРОГО НА РУССКОМ ЯЗЫКЕ.
    Ответ в формате JSON.

    Инсайты:
    {json.dumps(top_insights, ensure_ascii=False)}

    Структура JSON:
    {{
        "core_identity": "Одно предложение — суть души человека (на русском)",
        "core_archetype": "Творческое название архетипа (например: Космический Архитектор)",
        "narrative_role": "Роль в социальном и духовном контексте (на русском)",
        "energy_type": "Описание доминирующей вибрации / типа энергии (на русском)",
        "current_dynamic": "Что человек сейчас интегрирует или с чем сталкивается (на русском)",
        "polarities": {{
            "core_strengths": ["3 ключевые сильные стороны на русском"],
            "shadow_aspects": ["3 ключевые теневые черты на русском"]
        }}
    }}
    """

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    try:
        t0 = time.perf_counter()
        system_prompt = "Ты — мастер психологической и эволюционной астрологии. Отвечай ТОЛЬКО на русском языке."
        response = await client.chat.completions.create(
            model=settings.MODEL_LIGHT,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        raw_content = response.choices[0].message.content or "{}"
        duration_s = time.perf_counter() - t0
        logger.info(
            "[LLM_TRACE] label=portrait_summary model=%s duration=%.2fs usage=%s\n"
            "----- SYSTEM PROMPT BEGIN -----\n%s\n"
            "----- SYSTEM PROMPT END -----\n"
            "----- USER PAYLOAD BEGIN -----\n%s\n"
            "----- USER PAYLOAD END -----\n"
            "----- LLM RESPONSE BEGIN -----\n%s\n"
            "----- LLM RESPONSE END -----",
            settings.MODEL_LIGHT, duration_s,
            json.dumps(_usage_to_dict(response.usage), ensure_ascii=False),
            system_prompt, prompt, raw_content,
        )
        summary = json.loads(raw_content)
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
