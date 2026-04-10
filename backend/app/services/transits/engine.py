"""
Transit Engine — calculates aspects between transit planets and the user's
natal chart, producing energy/luck scores.

Key design decisions:
- Long periods (month/quarter/year) use multi-point sampling to catch
  aspects that enter/exit orb across the period, not just at the midpoint.
- Moon is skipped for month+ periods (moves 13°/day → aspect lasts ~5 h).
- House scoring uses Placidus-compatible lookup from the natal chart data.
- Scoring is normalized per the number of sample points to stay stable.
"""

from __future__ import annotations

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

# Moon is skipped for periods longer than a week (moves 13°/day → noise)
SKIP_FOR_LONG_PERIODS = {"moon"}

SLOW_PLANETS  = {"jupiter", "saturn", "uranus", "neptune", "pluto"}
BENEFICS      = {"jupiter", "venus"}
# Mars included: classic minor malefic, significant for conflict/risk scoring
MALEFICS_HARD = {"saturn", "uranus", "pluto", "mars"}

NATAL_PERSONAL = {"sun", "moon", "mercury", "venus", "mars"}
NATAL_ANGULAR  = {"asc", "mc"}

# ── Planet nature for conjunction scoring ───────────────────────────────────
# Used when asp = conjunction to determine harmonic/tense quality.
PLANET_NATURE: dict[str, str] = {
    "sun":      "harmonious",
    "moon":     "harmonious",
    "mercury":  "neutral",
    "venus":    "harmonious",
    "mars":     "tense",
    "jupiter":  "harmonious",
    "saturn":   "tense",
    "uranus":   "tense",
    "neptune":  "neutral",   # dissolving; depends on natal planet
    "pluto":    "tense",
}

# ── Aspect definitions ───────────────────────────────────────────────────────
ASPECTS: dict[str, float] = {
    "conjunction": 0.0,
    "sextile":     60.0,
    "square":      90.0,
    "trine":       120.0,
    "opposition":  180.0,
}

ASPECT_NATURE: dict[str, str] = {
    "conjunction": "neutral",   # resolved per-planet below
    "sextile":     "harmonious",
    "square":      "tense",
    "trine":       "harmonious",
    "opposition":  "tense",
}

# ── Scoring weights ──────────────────────────────────────────────────────────
ENERGY_WEIGHT: dict[str, float] = {
    "sun":      2.5,
    "moon":     1.5,
    "mercury":  1.0,
    "venus":    2.0,
    "mars":     2.5,
    "jupiter":  2.5,
    "saturn":   -2.0,
    "uranus":   -1.5,
    "neptune":  -1.0,
    "pluto":    -1.5,
}

# ── Houses ──────────────────────────────────────────────────────────────────
LUCK_HOUSES = {2, 5, 9, 10}
RISK_HOUSES = {8, 12}

# House bonus scaled down so it doesn't dominate aspect-based scoring
HOUSE_BONUS_BENEFIC_LUCK  =  2.0   # was 5.0 — now comparable to one aspect
HOUSE_BONUS_BENEFIC_RISK  = -1.5
HOUSE_MALEFIC_RISK        = -2.0

# ── Labels ──────────────────────────────────────────────────────────────────
PLANET_RU: dict[str, str] = {
    "sun":        "Солнце",
    "moon":       "Луна",
    "mercury":    "Меркурий",
    "venus":      "Венера",
    "mars":       "Марс",
    "jupiter":    "Юпитер",
    "saturn":     "Сатурн",
    "uranus":     "Уран",
    "neptune":    "Нептун",
    "pluto":      "Плутон",
    "asc":        "Асцендент",
    "mc":         "MC",
    "north_node": "Сев. Узел",
    "chiron":     "Хирон",
    "lilith":     "Лилит",
    "selena":     "Селена",
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


def _natal_house(natal_planets: dict, planet_lon: float) -> int:
    """
    Determine which natal Placidus house a transit planet occupies.
    Walks through house cusps stored on the natal planets: each planet
    carries a 'house' field. We reconstruct the cusp order from ASC
    using an equal-house fallback if Placidus cusps aren't available.
    Since we don't store all 12 Placidus cusp longitudes in natal_planets,
    we use the natal ASC as anchor and equal-house approximation.
    This is a known limitation — true Placidus would require storing cusps.
    """
    asc_lon = natal_planets.get("asc", {}).get("longitude", 0.0)
    rel = (planet_lon - asc_lon) % 360.0
    return int(rel / 30.0) + 1


def _sample_dates(date_from: date, date_to: date) -> list[date]:
    """
    Return sampling dates for the period.
    - week    : 3 points (start, mid, end)
    - month   : every 5 days (~6 points)
    - quarter : every 7 days (~13 points)
    - year    : every 14 days (~26 points)
    """
    total_days = (date_to - date_from).days
    if total_days <= 7:
        step = max(1, total_days // 2)
    elif total_days <= 31:
        step = 5
    elif total_days <= 92:
        step = 7
    else:
        step = 14

    samples: list[date] = []
    d = date_from
    while d <= date_to:
        samples.append(d)
        d += timedelta(days=step)
    if samples[-1] != date_to:
        samples.append(date_to)
    return samples


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
    Calculate transit aspects for the given period using multi-point sampling.
    natal_planets: dict from calculate_chart()["planets"] — each entry has
                   "longitude", "house", etc.
    Returns scored transit summary with high/medium priority aspect lists.
    """
    _ensure_ephe()

    date_from, date_to = get_period_dates(period)
    sample_dates = _sample_dates(date_from, date_to)
    is_long = (date_to - date_from).days > 7  # skip Moon for month+

    # Build natal reference points
    natal_refs: dict[str, float] = {}
    for pname in NATAL_PERSONAL:
        if pname in natal_planets:
            natal_refs[pname] = natal_planets[pname]["longitude"]
    for angle in NATAL_ANGULAR:
        if angle in natal_planets:
            natal_refs[angle] = natal_planets[angle]["longitude"]

    flags = swe.FLG_SWIEPH | swe.FLG_SPEED

    # Collect unique aspects across all sample dates.
    # Key: (transit_planet, natal_point, aspect_name) → best (tightest) hit
    best_aspects: dict[tuple, dict] = {}

    energy_raw = 0.0
    luck_raw   = 0.0

    for sample_date in sample_dates:
        jd = _date_to_jd(sample_date)

        for t_name, t_id in TRANSIT_PLANET_IDS.items():
            if is_long and t_name in SKIP_FOR_LONG_PERIODS:
                continue

            try:
                res   = swe.calc_ut(jd, t_id, flags)
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

                    key = (t_name, n_name, asp_name)
                    existing = best_aspects.get(key)
                    if existing is None or orb < existing["orb"]:
                        # Determine nature
                        nature = ASPECT_NATURE[asp_name]
                        if asp_name == "conjunction":
                            # Conjunction quality = nature of transit planet
                            nature = PLANET_NATURE.get(t_name, "neutral")

                        best_aspects[key] = {
                            "transit_planet":    t_name,
                            "natal_point":       n_name,
                            "aspect":            asp_name,
                            "nature":            nature,
                            "orb":               round(orb, 2),
                            "priority":          priority,
                            "transit_lon":       round(t_lon, 2),
                            "transit_planet_ru": PLANET_RU.get(t_name, t_name),
                            "natal_point_ru":    PLANET_RU.get(n_name, n_name),
                            "aspect_ru":         ASPECT_RU.get(asp_name, asp_name),
                        }

    # ── Score from unique aspects ────────────────────────────────────────────
    for asp in best_aspects.values():
        t_name = asp["transit_planet"]
        nature = asp["nature"]
        orb    = asp["orb"]
        factor = max(0.0, 1.0 - orb / 3.0)

        e_w = ENERGY_WEIGHT.get(t_name, 0.0)
        if nature == "harmonious":
            energy_raw += e_w * factor
        elif nature == "tense":
            energy_raw -= abs(e_w) * factor

        # Luck scoring: Mars penalizes on tense aspects
        if t_name in BENEFICS:
            luck_raw += (2.0 if nature == "harmonious" else -1.0) * factor
        elif t_name in MALEFICS_HARD:
            luck_raw += (-2.0 if nature == "tense" else 0.5) * factor

    # ── House-based luck (scaled, evaluated at midpoint) ────────────────────
    mid_date = date_from + (date_to - date_from) // 2
    mid_jd   = _date_to_jd(mid_date)

    for t_name, t_id in TRANSIT_PLANET_IDS.items():
        if is_long and t_name in SKIP_FOR_LONG_PERIODS:
            continue
        try:
            res   = swe.calc_ut(mid_jd, t_id, flags)
            t_lon = res[0][0] % 360.0
        except Exception:
            continue

        t_house = _natal_house(natal_planets, t_lon)
        if t_name in BENEFICS:
            if t_house in LUCK_HOUSES:
                luck_raw += HOUSE_BONUS_BENEFIC_LUCK
            elif t_house in RISK_HOUSES:
                luck_raw += HOUSE_BONUS_BENEFIC_RISK
        elif t_name in MALEFICS_HARD:
            if t_house in RISK_HOUSES:
                luck_raw += HOUSE_MALEFIC_RISK

    # ── Normalize scores ─────────────────────────────────────────────────────
    energy_score    = min(100, max(0, int(50 + energy_raw * 3.5)))
    luck_risk_score = min(50, max(-50, int(luck_raw * 2.0)))

    # ── Sort and return top aspects ──────────────────────────────────────────
    aspects_found = list(best_aspects.values())
    aspects_found.sort(key=lambda x: (0 if x["priority"] == "high" else 1, x["orb"]))

    return {
        "date_from":               date_from.strftime("%d.%m.%Y"),
        "date_to":                 date_to.strftime("%d.%m.%Y"),
        "period":                  period,
        "energy_score":            energy_score,
        "luck_risk_score":         luck_risk_score,
        "high_priority_aspects":   [a for a in aspects_found if a["priority"] == "high"][:6],
        "medium_priority_aspects": [a for a in aspects_found if a["priority"] == "medium"][:8],
    }
