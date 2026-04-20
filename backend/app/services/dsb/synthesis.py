from collections import defaultdict
from app.models.uis import UniversalInsight
from app.core.db import get_supabase
import logging
from app.core.config import settings
import json
import openai

logger = logging.getLogger(__name__)

SPHERE_NAMES_RU: dict[int, str] = {
    1: "Личность",      2: "Ресурсы",       3: "Связи",
    4: "Корни",         5: "Творчество",    6: "Служение",
    7: "Партнёрство",   8: "Психология",    9: "Мировоззрение",
    10: "Реализация",   11: "Сообщества",   12: "Запредельное",
}


def synthesize(insights: list[UniversalInsight], system_name: str = "western_astrology") -> dict:
    level_order = {"high": 0, "medium": 1, "low": 2}

    result = defaultdict(lambda: defaultdict(list))
    for ins in insights:
        result[system_name][ins.primary_sphere].append(ins)

    for system in result:
        for sphere_id in result[system]:
            result[system][sphere_id].sort(
                key=lambda x: (level_order[x.influence_level], -x.weight)
            )

    return result


async def generate_portrait_summary(user_id: str, synthesized_data: dict) -> dict:
    """Generates legacy portrait summary (used as fallback before 12 spheres)."""
    top_insights = []
    for system in synthesized_data:
        for sphere_id in synthesized_data[system]:
            sphere_items = synthesized_data[system][sphere_id][:2]
            for item in sphere_items:
                top_insights.append({
                    "sphere": item.primary_sphere,
                    "theme": item.core_theme,
                    "energy": getattr(item, "description", "") or getattr(item, "energy_description", ""),
                })

    prompt = f"""
    You are the AVATAR Synthesis Engine.
    Based on the following astrological insights, generate a cohesive character portrait.
    Provide the response in STRICT JSON format. All text in RUSSIAN.

    Insights:
    {json.dumps(top_insights, ensure_ascii=False)}

    JSON Structure:
    {{
        "core_identity": "A 1-sentence powerful description of the soul's essence",
        "core_archetype": "A creative title (e.g. Космический Архитектор)",
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
            model=settings.MODEL_HEAVY,
            messages=[
                {"role": "system", "content": "Ты — мастер психологической и эволюционной астрологии. Отвечай строго на русском."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"Failed to generate portrait summary: {e}")
        return {
            "core_identity": "Путь исследования и трансформации",
            "core_archetype": "Странник",
            "narrative_role": "Искатель истины",
            "energy_type": "Сбалансированная",
            "current_dynamic": "Ожидание активации",
            "polarities": {"core_strengths": [], "shadow_aspects": []},
        }


async def generate_master_portrait(sphere_summaries: dict) -> dict:
    """
    Master Synthesizer — финальный портрет из 12 микро-выжимок сфер.
    Возвращает JSON с 6 полями, каждое содержит value + description.
    """
    summaries_text = "\n".join([
        f"Сфера {k} ({SPHERE_NAMES_RU.get(int(k), k)}): {v}"
        for k, v in sorted(sphere_summaries.items(), key=lambda x: int(x[0]))
    ])

    prompt = f"""Ты — AVATAR Master Synthesizer. На основе 12 микро-выжимок сфер жизни собери итоговый архетипный портрет.

Микро-выжимки сфер пользователя:
{summaries_text}

Верни строго валидный JSON без markdown-блоков:
{{
  "identification": {{"value": "...", "description": "..."}},
  "archetype":      {{"value": "...", "description": "..."}},
  "role":           {{"value": "...", "description": "..."}},
  "energy":         {{"value": "...", "description": "..."}},
  "dynamics":       {{"value": "...", "description": "..."}},
  "atmosphere":     {{"value": "...", "description": "..."}}
}}

Правила:
- value: 2–4 слова, точное и образное определение
- description: до 200 символов, персонализированное раскрытие смысла для конкретного человека
- atmosphere.description: кинематографичная атмосфера ауры — запах, текстура, свет, общее впечатление; не более 200 символов
- Максимально персонализировано на основе выжимок, не шаблонно
- Весь текст строго на русском языке"""

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    try:
        response = await client.chat.completions.create(
            model=settings.MODEL_HEAVY,
            messages=[
                {"role": "system", "content": "Ты — архетипный синтезатор личности. Создаёшь точные, глубокие, персонализированные портреты."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"Master portrait generated: {list(result.keys())}")
        return result
    except Exception as e:
        logger.error(f"Master portrait generation failed: {e}")
        return {}


async def update_sphere_summary(
    user_id: str,
    sphere_id: int,
    short_summary: str,
    sphere_archetype: str = "",
) -> None:
    """
    Upserts short_summary + sphere_archetype for one sphere into user_portraits.
    Triggers master synthesis automatically when active_spheres_count reaches 12.
    """
    if not short_summary:
        return

    supabase = get_supabase()

    try:
        res = supabase.table("user_portraits") \
            .select("id, sphere_summaries, sphere_archetypes, active_spheres_count") \
            .eq("user_id", user_id).execute()

        if res.data:
            row = res.data[0]
            summaries: dict = dict(row.get("sphere_summaries") or {})
            archetypes: dict = dict(row.get("sphere_archetypes") or {})

            summaries[str(sphere_id)] = short_summary
            if sphere_archetype:
                archetypes[str(sphere_id)] = sphere_archetype

            active_count = len(summaries)

            update_payload: dict = {
                "sphere_summaries":   summaries,
                "sphere_archetypes":  archetypes,
                "active_spheres_count": active_count,
            }

            if active_count == 12:
                logger.info(f"All 12 spheres ready for {user_id} — triggering master synthesis")
                try:
                    master = await generate_master_portrait(summaries)
                    if master:
                        update_payload["master_portrait"] = master
                except Exception as e:
                    logger.error(f"Master synthesis failed for {user_id}: {e}")

            supabase.table("user_portraits").update(update_payload).eq("user_id", user_id).execute()

        else:
            # No portrait row yet — create minimal one
            supabase.table("user_portraits").insert({
                "user_id":              user_id,
                "sphere_summaries":     {str(sphere_id): short_summary},
                "sphere_archetypes":    {str(sphere_id): sphere_archetype} if sphere_archetype else {},
                "active_spheres_count": 1,
                "core_identity":        "",
                "core_archetype":       "",
                "narrative_role":       "",
                "energy_type":          "",
                "current_dynamic":      "",
                "deep_profile_data":    {"polarities": {"core_strengths": [], "shadow_aspects": []}},
            }).execute()

    except Exception as e:
        logger.error(f"update_sphere_summary failed for user={user_id} sphere={sphere_id}: {e}")


async def save_to_supabase(
    user_id: str,
    result: dict,
    portrait: dict | None = None,
    sphere_summaries: dict | None = None,
    sphere_archetypes: dict | None = None,
) -> bool:
    """Saves synthesized insights and portrait to Supabase. Preserves accumulated sphere_summaries."""
    supabase = get_supabase()
    rows = []

    for system, spheres in result.items():
        for sphere_id, insights in spheres.items():
            for rank, ins in enumerate(insights):
                rows.append({
                    "user_id":        user_id,
                    "system":         system,
                    "primary_sphere": sphere_id,
                    "rank":           rank,
                    **ins.model_dump(),
                })

    try:
        # Clean rewrite for insights
        for sys in list(result.keys()):
            supabase.table("user_insights").delete().eq("user_id", user_id).eq("system", sys).execute()
        if rows:
            supabase.table("user_insights").insert(rows).execute()

        # Portrait — upsert to preserve sphere_summaries
        if portrait:
            existing_res = supabase.table("user_portraits") \
                .select("id, sphere_summaries, active_spheres_count") \
                .eq("user_id", user_id).execute()

            portrait_data: dict = {
                "user_id":          user_id,
                "core_identity":    portrait.get("core_identity", ""),
                "core_archetype":   portrait.get("core_archetype", ""),
                "narrative_role":   portrait.get("narrative_role", ""),
                "energy_type":      portrait.get("energy_type", ""),
                "current_dynamic":  portrait.get("current_dynamic", ""),
                "deep_profile_data": {"polarities": portrait.get("polarities", {})},
            }

            # Merge incoming sphere_summaries and sphere_archetypes with any already stored
            if sphere_summaries:
                existing_summaries: dict = {}
                existing_archetypes: dict = {}
                if existing_res.data:
                    existing_summaries = dict(existing_res.data[0].get("sphere_summaries") or {})
                    existing_archetypes = dict(existing_res.data[0].get("sphere_archetypes") or {})
                merged = {**existing_summaries, **{str(k): v for k, v in sphere_summaries.items()}}
                portrait_data["sphere_summaries"] = merged
                portrait_data["active_spheres_count"] = len(merged)
                if sphere_archetypes:
                    merged_arch = {**existing_archetypes, **{str(k): v for k, v in sphere_archetypes.items()}}
                    portrait_data["sphere_archetypes"] = merged_arch

                if len(merged) == 12:
                    logger.info(f"All 12 summaries present for {user_id} — triggering master synthesis")
                    try:
                        master = await generate_master_portrait(merged)
                        if master:
                            portrait_data["master_portrait"] = master
                    except Exception as e:
                        logger.error(f"Master synthesis failed: {e}")

            if existing_res.data:
                supabase.table("user_portraits").update(portrait_data).eq("user_id", user_id).execute()
            else:
                supabase.table("user_portraits").insert(portrait_data).execute()

        return True

    except Exception as e:
        logger.error(f"Failed to save to Supabase: {e}")
        raise e
