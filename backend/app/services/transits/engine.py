"""
Transit Engine — calculates aspects between current transit planets
and the user's natal chart, producing energy/luck scores.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, date
from typing import Literal

import swisseph as swe

from app.services.dsb.natal_chart import _ensure_ephe

PeriodType = Literal["week", "month", "quarter", "year"]

# ── Planet IDs ──────────────────────────────────────────────────────────────
TRANSIT_PLANET_IDS: dict[str, int] = {
    "sun":      swe.SUN,
    "moon":     swe.MOON,
    "mercury":  swe.MERCURY,
    "venus":    swe.VENUS,
    "mars":     swe.MARS,
    "jupiter":  swe.JUPITER,
    "saturn":   swe.SATURN,
    "uranus":   swe.URANUS,
    "neptune":  swe.NEPTUNE,
    "pluto":    swe.PLUTO,
}

SLOW_PLANETS  = {"jupiter", "saturn", "uranus", "neptune", "pluto"}
FAST_PLANETS  = {"sun", "moon", "mercury", "venus", "mars"}
BENEFICS      = {"jupiter", "venus"}
MALEFICS_HARD = {"saturn", "uranus", "pluto"}

NATAL_PERSONAL = {"sun", "moon", "mercury", "venus", "mars"}
NATAL_ANGULAR  = {"asc", "mc"}

# ── Aspect definitions ───────────────────────────────────────────────────────
ASPECTS: dict[str, float] = {
    "conjunction": 0.0,
    "sextile":     60.0,
    "square":      90.0,
    "trine":       120.0,
    "opposition":  180.0,
}

ASPECT_NATURE: dict[str, str] = {
    "conjunction": "neutral",
    "sextile":     "harmonious",
    "square":      "tense",
    "trine":       "harmonious",
    "opposition":  "tense",
}

# ── Scoring weights ──────────────────────────────────────────────────────────
ENERGY_WEIGHT: dict[str, float] = {
    "sun":      3.0,
    "mars":     3.0,
    "jupiter":  2.5,
    "venus":    2.0,
    "moon":     1.5,
    "mercury":  1.0,
    "saturn":   -2.0,
    "neptune":  -1.0,
    "uranus":   -1.5,
    "pluto":    -1.5,
}

LUCK_HOUSES  = {2, 5, 9, 10}
RISK_HOUSES  = {8, 12}

PLANET_RU: dict[str, str] = {
    "sun":      "Солнце",
    "moon":     "Луна",
    "mercury":  "Меркурий",
    "venus":    "Венера",
    "mars":     "Марс",
    "jupiter":  "Юпитер",
    "saturn":   "Сатурн",
    "uranus":   "Уран",
    "neptune":  "Нептун",
    "pluto":    "Плутон",
    "asc":      "Асцендент",
    "mc":       "MC",
    "north_node": "Сев. Узел",
    "chiron":   "Хирон",
    "lilith":   "Лилит",
    "selena":   "Селена",
}

ASPECT_RU: dict[str, str] = {
    "conjunction": "☌ соединение",
    "sextile":     "⚹ секстиль",
    "square":      "□ квадрат",
    "trine":       "△ трин",
    "opposition":  "☍ оппозиция",
}


# ── Helpers ──────────────────────────────────────────────────────────────────
def _date_to_jd(d: date) -> float:
    return swe.julday(d.year, d.month, d.day, 12.0)


def _angle_diff(a: float, b: float) -> float:
    diff = abs(a - b) % 360.0
    return diff if diff <= 180.0 else 360.0 - diff


def _get_transit_house(planet_lon: float, asc_lon: float) -> int:
    """Equal-house system from ASC (approximate)."""
    rel = (planet_lon - asc_lon) % 360.0
    return int(rel / 30.0) + 1


def get_period_dates(period: PeriodType) -> tuple[date, date]:
    today = datetime.now().date()
    delta_map: dict[str, int] = {
        "week":    7,
        "month":   30,
        "quarter": 91,
        "year":    365,
    }
    return today, today + timedelta(days=delta_map[period])


# ── Main calculation ──────────────────────────────────────────────────────────
def calculate_transits(
    natal_planets: dict,
    period: PeriodType,
) -> dict:
    """
    Calculate transit aspects for the given period.
    natal_planets: dict from calculate_chart()["planets"]
                   each entry has "longitude", "house", etc.
    Returns transit summary dict with scores + aspect lists.
    """
    _ensure_ephe()

    date_from, date_to = get_period_dates(period)
    mid_date = date_from + (date_to - date_from) // 2
    mid_jd   = _date_to_jd(mid_date)

    # Build natal reference points
    natal_refs: dict[str, float] = {}
    for pname in NATAL_PERSONAL:
        if pname in natal_planets:
            natal_refs[pname] = natal_planets[pname]["longitude"]
    for angle in NATAL_ANGULAR:
        if angle in natal_planets:
            natal_refs[angle] = natal_planets[angle]["longitude"]

    asc_lon = natal_planets.get("asc", {}).get("longitude", 0.0)

    aspects_found: list[dict] = []
    energy_raw = 0.0
    luck_raw   = 0.0

    flags = swe.FLG_SWIEPH | swe.FLG_SPEED

    for t_name, t_id in TRANSIT_PLANET_IDS.items():
        try:
            res   = swe.calc_ut(mid_jd, t_id, flags)
            t_lon = res[0][0] % 360.0
        except Exception:
            continue

        is_slow    = t_name in SLOW_PLANETS
        high_orb   = 1.0
        medium_orb = 3.0

        for n_name, n_lon in natal_refs.items():
            diff = _angle_diff(t_lon, n_lon)

            for asp_name, asp_angle in ASPECTS.items():
                orb = abs(diff - asp_angle)

                if is_slow and orb <= high_orb:
                    priority = "high"
                elif orb <= medium_orb:
                    priority = "medium"
                else:
                    continue

                # Determine nature
                nature = ASPECT_NATURE[asp_name]
                if asp_name == "conjunction":
                    if t_name in BENEFICS:
                        nature = "harmonious"
                    elif t_name in MALEFICS_HARD:
                        nature = "tense"

                aspects_found.append({
                    "transit_planet": t_name,
                    "natal_point":    n_name,
                    "aspect":         asp_name,
                    "nature":         nature,
                    "orb":            round(orb, 2),
                    "priority":       priority,
                    "transit_lon":    round(t_lon, 2),
                    "transit_planet_ru": PLANET_RU.get(t_name, t_name),
                    "natal_point_ru":    PLANET_RU.get(n_name, n_name),
                    "aspect_ru":         ASPECT_RU.get(asp_name, asp_name),
                })

                # Energy scoring
                e_w = ENERGY_WEIGHT.get(t_name, 0.0)
                factor = 1.0 - orb / medium_orb
                if nature == "harmonious":
                    energy_raw += e_w * factor
                elif nature == "tense":
                    energy_raw -= abs(e_w) * factor

                # Luck/risk scoring
                if t_name in BENEFICS:
                    luck_raw += (2.0 if nature == "harmonious" else -1.0) * factor
                elif t_name in MALEFICS_HARD:
                    luck_raw += (-2.0 if nature == "tense" else 0.5) * factor

        # House-based luck for benefics/malefics
        t_house = _get_transit_house(t_lon, asc_lon)
        if t_name in BENEFICS:
            if t_house in LUCK_HOUSES:
                luck_raw += 5.0
            elif t_house in RISK_HOUSES:
                luck_raw -= 3.0
        elif t_name in MALEFICS_HARD:
            if t_house in RISK_HOUSES:
                luck_raw -= 4.0

    # Normalize
    energy_score    = min(100, max(0, int(50 + energy_raw * 4)))
    luck_risk_score = min(50, max(-50, int(luck_raw * 2.5)))

    # Sort: high priority first, then by tightness
    aspects_found.sort(key=lambda x: (0 if x["priority"] == "high" else 1, x["orb"]))

    return {
        "date_from":              date_from.strftime("%d.%m.%Y"),
        "date_to":                date_to.strftime("%d.%m.%Y"),
        "period":                 period,
        "energy_score":           energy_score,
        "luck_risk_score":        luck_risk_score,
        "high_priority_aspects":  [a for a in aspects_found if a["priority"] == "high"][:6],
        "medium_priority_aspects":[a for a in aspects_found if a["priority"] == "medium"][:8],
    }
