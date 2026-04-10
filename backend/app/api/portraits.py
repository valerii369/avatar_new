from fastapi import APIRouter, HTTPException
from collections import defaultdict
from app.core.db import get_supabase
from app.services.dsb.natal_chart import calculate_chart
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Planet display names (RU) ──────────────────────────────────────────────────
PLANET_LABELS: dict[str, str] = {
    "sun":            "Солнце",
    "moon":           "Луна",
    "mercury":        "Меркурий",
    "venus":          "Венера",
    "mars":           "Марс",
    "jupiter":        "Юпитер",
    "saturn":         "Сатурн",
    "uranus":         "Уран",
    "neptune":        "Нептун",
    "pluto":          "Плутон",
    "north_node":     "С. Узел",
    "south_node":     "Ю. Узел",
    "chiron":         "Хирон",
    "lilith":         "Лилит",
    "asc":            "АСЦ",
    "mc":             "МС",
    "part_of_fortune":"Парс",
}

# ── Zodiac sign abbreviations (RU) ────────────────────────────────────────────
SIGN_RU: dict[str, str] = {
    "Aries":       "Овен",
    "Taurus":      "Телец",
    "Gemini":      "Близнецы",
    "Cancer":      "Рак",
    "Leo":         "Лев",
    "Virgo":       "Дева",
    "Libra":       "Весы",
    "Scorpio":     "Скорпион",
    "Sagittarius": "Стрелец",
    "Capricorn":   "Козерог",
    "Aquarius":    "Водолей",
    "Pisces":      "Рыбы",
}


def _fmt_position(data: dict) -> str:
    """Format planet data as '14°32′ Телец, 1 дом'."""
    deg_float = data.get("degree_in_sign", 0.0)
    deg = int(deg_float)
    minutes = round((deg_float - deg) * 60)
    sign_ru = SIGN_RU.get(data.get("sign", ""), data.get("sign", ""))
    house = data.get("house", "")
    retro = " ℞" if data.get("retrograde") else ""
    return f"{deg}°{minutes:02d}′ {sign_ru}, {house} дом{retro}"


def _build_natal_positions(planets: dict) -> list[dict]:
    """Return ordered list of {key, label, position_str} for all planets."""
    order = [
        "sun", "moon", "mercury", "venus", "mars",
        "jupiter", "saturn", "uranus", "neptune", "pluto",
        "north_node", "south_node", "chiron", "lilith",
        "asc", "mc",
    ]
    result = []
    for key in order:
        if key not in planets:
            continue
        result.append({
            "key":          key,
            "label":        PLANET_LABELS.get(key, key),
            "position_str": _fmt_position(planets[key]),
        })
    return result


@router.get("/{user_id}")
async def get_portrait(user_id: str):
    """
    Fetches insights + portrait summary + natal positions for the MasterHubView.
    """
    try:
        supabase = get_supabase()

        # 1. Fetch 12-Sphere Insights
        insights_resp = (
            supabase.table("user_insights")
            .select("*")
            .eq("user_id", user_id)
            .order("system").order("primary_sphere").order("rank")
            .execute()
        )

        # 2. Fetch Portrait Summary
        portrait_resp = (
            supabase.table("user_portraits")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )

        if not insights_resp.data and not portrait_resp.data:
            return {"status": "pending", "message": "Portrait is still calculating or not requested"}

        # 3. Natal chart positions (computed from birth data)
        natal_positions: list[dict] = []
        try:
            birth_resp = (
                supabase.table("user_birth_data")
                .select("birth_date,birth_time,birth_place")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if birth_resp.data:
                b = birth_resp.data[0]
                chart = await calculate_chart(b["birth_date"], b["birth_time"], b["birth_place"])
                natal_positions = _build_natal_positions(chart.get("planets", {}))
        except Exception as e:
            logger.warning(f"Could not compute natal positions for {user_id}: {e}")

        # Group insights by system and sphere
        spheres = defaultdict(lambda: defaultdict(list))
        for row in insights_resp.data:
            sys = row["system"]
            sphere = row["primary_sphere"]
            insight = {
                "id":                 row["id"],
                "rank":               row["rank"],
                "primary_sphere":     row["primary_sphere"],
                "influence_level":    row["influence_level"],
                "weight":             row["weight"],
                "position":           row["position"],
                "core_theme":         row["core_theme"],
                "description":        row.get("description") or row.get("energy_description", ""),
                "light_aspect":       row["light_aspect"],
                "shadow_aspect":      row["shadow_aspect"],
                "insight":            row.get("insight", ""),
                "gift":               row.get("gift", ""),
                "developmental_task": row["developmental_task"],
                "integration_key":    row["integration_key"],
                "triggers":           row["triggers"],
                "source":             row.get("source"),
            }
            spheres[sys][str(sphere)].append(insight)

        portrait_data = portrait_resp.data[0] if portrait_resp.data else None

        hub = {
            "insights": {sys: dict(sph) for sys, sph in spheres.items()},
            "portrait_summary": {
                "core_identity":   portrait_data.get("core_identity")   if portrait_data else "Инициация...",
                "core_archetype":  portrait_data.get("core_archetype")  if portrait_data else "Странник",
                "narrative_role":  portrait_data.get("narrative_role")  if portrait_data else "Искатель",
                "energy_type":     portrait_data.get("energy_type")     if portrait_data else "Неопределена",
                "current_dynamic": portrait_data.get("current_dynamic") if portrait_data else "Трансформация",
            } if portrait_data else None,
            "deep_profile_data":  portrait_data.get("deep_profile_data") if portrait_data else None,
            "natal_positions":    natal_positions,
        }

        return hub
    except Exception as e:
        logger.error(f"Error fetching portrait for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Error fetching portrait data")
