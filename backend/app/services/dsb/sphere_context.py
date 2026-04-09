"""
sphere_context.py — Data Mapper
Extracts isolated micro-context for each of the 12 spheres from the full chart dict.

Rule: each sphere agent sees ONLY the data relevant to its house.
This eliminates hallucinations caused by LLM "attention diffusion" over a large JSON.
"""
from __future__ import annotations

SPHERE_NAMES: dict[int, str] = {
    1:  "Личность и тело",
    2:  "Ресурсы и ценности",
    3:  "Мышление и коммуникации",
    4:  "Семья и корни",
    5:  "Творчество и самовыражение",
    6:  "Здоровье и служение",
    7:  "Отношения и партнёрство",
    8:  "Трансформация и глубина",
    9:  "Смысл и путешествия",
    10: "Карьера и репутация",
    11: "Социум и мечты",
    12: "Тень и растворение",
}

# Target insight count range per sphere  [min, max]
SPHERE_TARGETS: dict[int, tuple[int, int]] = {
    1: (7, 9),   2: (4, 6),   3: (5, 7),   4: (4, 6),
    5: (4, 6),   6: (3, 5),   7: (6, 8),   8: (5, 7),
    9: (4, 6),  10: (5, 7),  11: (3, 5),  12: (6, 8),
}

SIGN_RULERSHIPS: dict[str, str] = {
    "Aries":       "mars",
    "Taurus":      "venus",
    "Gemini":      "mercury",
    "Cancer":      "moon",
    "Leo":         "sun",
    "Virgo":       "mercury",
    "Libra":       "venus",
    "Scorpio":     "pluto",
    "Sagittarius": "jupiter",
    "Capricorn":   "saturn",
    "Aquarius":    "uranus",
    "Pisces":      "neptune",
}

# Traditional co-rulers (supplement the modern ruler)
CO_RULERSHIPS: dict[str, str] = {
    "Scorpio":     "mars",
    "Aquarius":    "saturn",
    "Pisces":      "jupiter",
}

ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]


def _cusp_sign(houses: dict, sphere_num: int) -> str:
    """Derive the zodiac sign on the cusp of the given house."""
    cusp_lon = houses.get(str(sphere_num), {}).get("cusp", 0.0)
    return ZODIAC_SIGNS[int(cusp_lon // 30)]


def _planet_summary(name: str, planets: dict) -> dict | None:
    p = planets.get(name)
    if not p:
        return None
    return {
        "name":            name,
        "sign":            p["sign"],
        "house":           p.get("house"),
        "degree_in_sign":  p["degree_in_sign"],
        "retrograde":      p.get("retrograde", False),
        "stationary":      p.get("stationary", False),
        "dignity_score":   p.get("dignity_score", 0),
        "position_weight": p.get("position_weight", 0.5),
    }


def _planets_in_house(planets: dict, house_num: int) -> list[dict]:
    """All non-angle planets that reside in the given house."""
    result = []
    for name, p in planets.items():
        if p.get("is_angle"):
            continue
        if p.get("house") == house_num:
            entry = _planet_summary(name, planets)
            if entry:
                result.append(entry)
    return result


def _aspects_involving(aspects: list[dict], planet_names: set[str]) -> list[dict]:
    """Aspects where either participant is in planet_names."""
    return [
        a for a in aspects
        if a["planet_a"] in planet_names or a["planet_b"] in planet_names
    ]


def extract_sphere_context(chart: dict, sphere_num: int) -> dict:
    """
    Build an isolated micro-context for one sphere.

    Includes:
    - cusp_sign: sign on the house cusp
    - ruler: primary modern ruler with full position data
    - co_ruler: traditional co-ruler (Scorpio/Aquarius/Pisces only)
    - planets_in_house: all planets physically inside this house
    - aspects_to_ruler: all chart aspects involving the ruler (capped at 12)
    - aspects_to_co_ruler: same for co-ruler (capped at 8)
    - resident_aspects: aspects among planets inside the house (capped at 10)
    - ruler_receptions: mutual receptions involving the ruler
    - balance: chart-level element/modality/hemisphere summary
    - meta: day/night, timezone
    - chart_ruler: planet ruling the ASC sign (chart-level significance)
    - chart_shape: Jones pattern name
    - dispositor: {direct, final, chart_final_dispositor}
    - unaspected_planets: list of planet names with zero major aspects
    - planets_on_angles: list of {planet, angle, orb, exact} dicts
    """
    planets = chart.get("planets", {})
    houses  = chart.get("houses", {})
    aspects = chart.get("aspects", [])
    balance = chart.get("balance", {})
    mutual  = chart.get("mutual_receptions", [])

    cusp_sign  = _cusp_sign(houses, sphere_num)
    ruler_name = SIGN_RULERSHIPS.get(cusp_sign, "")
    co_name    = CO_RULERSHIPS.get(cusp_sign)

    ruler    = _planet_summary(ruler_name, planets) if ruler_name else None
    co_ruler = _planet_summary(co_name, planets) if co_name else None

    residents       = _planets_in_house(planets, sphere_num)
    resident_names  = {r["name"] for r in residents}

    aspects_to_ruler    = _aspects_involving(aspects, {ruler_name})[:12] if ruler_name else []
    aspects_to_co_ruler = _aspects_involving(aspects, {co_name})[:8]     if co_name    else []
    resident_aspects    = _aspects_involving(aspects, resident_names)[:10]

    ruler_receptions = [
        mr for mr in mutual
        if ruler_name in (mr.get("planet_a"), mr.get("planet_b"))
    ]

    min_ins, max_ins = SPHERE_TARGETS[sphere_num]

    # Chart-level context (relevant for every sphere)
    unaspected        = chart.get("unaspected_planets", [])
    on_angles         = chart.get("planets_on_angles", [])
    chart_shape       = chart.get("chart_shape", "")
    dispositor        = chart.get("dispositor", {})
    chart_ruler       = chart.get("chart_ruler", "")
    out_of_bounds     = chart.get("out_of_bounds", [])
    intercepted_raw   = chart.get("intercepted_signs", {})

    # Sphere-specific: intercepted sign within THIS house (if any)
    inh_map  = intercepted_raw.get("intercepted_in_house", {})
    intercepted_here = [s for s, h in inh_map.items() if h == sphere_num]

    # OOB planets relevant to this sphere (resident or ruler)
    sphere_planet_names = resident_names | ({ruler_name} if ruler_name else set())
    oob_here = [e for e in out_of_bounds if e["planet"] in sphere_planet_names]

    return {
        "sphere":               sphere_num,
        "sphere_name":          SPHERE_NAMES[sphere_num],
        "cusp_sign":            cusp_sign,
        "ruler":                ruler,
        "co_ruler":             co_ruler,
        "planets_in_house":     residents,
        "aspects_to_ruler":     aspects_to_ruler,
        "aspects_to_co_ruler":  aspects_to_co_ruler,
        "resident_aspects":     resident_aspects,
        "ruler_receptions":     ruler_receptions,
        "balance":              balance,
        "meta":                 chart.get("meta", {}),
        # Chart-level structural context
        "chart_ruler":          chart_ruler,
        "chart_shape":          chart_shape,
        "dispositor":           dispositor,
        "unaspected_planets":   unaspected,
        "planets_on_angles":    on_angles,
        # OOB & intercepted (sphere-scoped)
        "out_of_bounds_here":   oob_here,           # OOB planets in this sphere
        "intercepted_sign":     intercepted_here,   # sign intercepted in this house
        "_target_min":          min_ins,
        "_target_max":          max_ins,
    }


def prepare_all_sphere_contexts(chart: dict) -> dict[int, dict]:
    """Returns all 12 isolated sphere contexts keyed by sphere number."""
    return {n: extract_sphere_context(chart, n) for n in range(1, 13)}
