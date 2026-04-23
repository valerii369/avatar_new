"""
sphere_context.py — Data Mapper
Extracts isolated micro-context for each of the 12 spheres from the full chart dict.

Rule: each sphere agent sees ONLY the data relevant to its house.
This eliminates hallucinations caused by LLM "attention diffusion" over a large JSON.
"""
from __future__ import annotations
from app.services.dsb.aspect_synthesis import build_planet_synthesis

SPHERE_NAMES: dict[int, str] = {
    1:  "Личность",
    2:  "Деньги",
    3:  "Окружение",
    4:  "Семья",
    5:  "Таланты",
    6:  "Здоровье",
    7:  "Отношения",
    8:  "Риски",
    9:  "Путь жизни",
    10: "Реализация",
    11: "Сообщество",
    12: "Душа",
}

# Target insight count range per sphere  [min, max]
# Raised +3 min / +4 max across the board after expanding field limits
# (insight 1500, light/shadow 1000) — each card is now richer but fewer
# was fitting in 10k tokens. max_completion_tokens also raised to 18k.
SPHERE_TARGETS: dict[int, tuple[int, int]] = {
    1:  (12, 16),  # Личность — центральная сфера
    2:  ( 9, 12),  # Деньги
    3:  (10, 13),  # Окружение
    4:  ( 9, 12),  # Семья
    5:  ( 9, 12),  # Таланты
    6:  ( 8, 11),  # Здоровье
    7:  (11, 15),  # Отношения — ключевая сфера
    8:  (10, 14),  # Риски
    9:  ( 9, 12),  # Путь жизни
    10: (10, 13),  # Реализация
    11: ( 8, 11),  # Сообщество
    12: (11, 15),  # Душа — ключевая сфера
}

# Virtual points — act as modifiers, don't rule houses
VIRTUAL_POINTS = {"lilith", "selena", "chiron"}
# Personal planets — virtual points only aspected to these (narrow orb)
PERSONAL_PLANETS = {"sun", "moon", "mercury", "venus", "mars"}

CROSS_ELEMENT: dict[str, dict] = {
    "Aries":       {"cross": "cardinal", "element": "fire"},
    "Taurus":      {"cross": "fixed",    "element": "earth"},
    "Gemini":      {"cross": "mutable",  "element": "air"},
    "Cancer":      {"cross": "cardinal", "element": "water"},
    "Leo":         {"cross": "fixed",    "element": "fire"},
    "Virgo":       {"cross": "mutable",  "element": "earth"},
    "Libra":       {"cross": "cardinal", "element": "air"},
    "Scorpio":     {"cross": "fixed",    "element": "water"},
    "Sagittarius": {"cross": "mutable",  "element": "fire"},
    "Capricorn":   {"cross": "cardinal", "element": "earth"},
    "Aquarius":    {"cross": "fixed",    "element": "air"},
    "Pisces":      {"cross": "mutable",  "element": "water"},
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


def _planet_summary(name: str, planets: dict, include_dispositor: bool = False) -> dict | None:
    p = planets.get(name)
    if not p:
        return None
    result: dict = {
        "name":            name,
        "sign":            p["sign"],
        "house":           p.get("house"),
        "degree_in_sign":  p["degree_in_sign"],
        "retrograde":      p.get("retrograde", False),
        "stationary":      p.get("stationary", False),
        "dignity_score":   p.get("dignity_score", 0),
        "position_weight": p.get("position_weight", 0.5),
    }
    if include_dispositor:
        disp_name = SIGN_RULERSHIPS.get(p["sign"])
        if disp_name and disp_name != name:
            d = planets.get(disp_name)
            if d:
                result["dispositor"] = {
                    "name":          disp_name,
                    "sign":          d.get("sign"),
                    "house":         d.get("house"),
                    "dignity_score": d.get("dignity_score", 0),
                    "retrograde":    d.get("retrograde", False),
                    "position_weight": d.get("position_weight", 0.5),
                }
    return result


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


def _virtual_point_context(planets: dict, aspects: list[dict], sphere_num: int,
                            sphere_planet_names: set[str]) -> dict:
    """
    Build virtual points context for a sphere:
    - Which of Lilith / Selena / Chiron are in this house
    - Their major aspects to personal planets of this sphere (orb ≤ 3°)
    """
    result: dict = {}

    for vp in ("lilith", "selena", "chiron"):
        data = planets.get(vp)
        if not data:
            continue

        # Is this virtual point IN the sphere's house?
        in_house = data.get("house") == sphere_num

        # Narrow-orb aspects to sphere's personal planets (≤ 3°)
        vp_aspects = [
            a for a in aspects
            if (a["planet_a"] == vp or a["planet_b"] == vp)
            and a.get("orb", 99) <= 3.0
            and (
                (a["planet_a"] in PERSONAL_PLANETS and a["planet_a"] in sphere_planet_names)
                or (a["planet_b"] in PERSONAL_PLANETS and a["planet_b"] in sphere_planet_names)
                # Also include if the vp aspects any personal planet (even outside sphere)
                or a["planet_a"] in PERSONAL_PLANETS
                or a["planet_b"] in PERSONAL_PLANETS
            )
        ]

        if not in_house and not vp_aspects:
            continue  # No influence on this sphere — skip

        entry: dict = {
            "name":          vp,
            "sign":          data.get("sign"),
            "house":         data.get("house"),
            "degree_in_sign": data.get("degree_in_sign"),
            "in_this_house": in_house,
            "aspects_to_personal": vp_aspects[:5],
        }
        result[vp] = entry

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

    # include_dispositor=True: агент видит «хозяина хозяина» — критично для оценки качества планеты
    ruler    = _planet_summary(ruler_name, planets, include_dispositor=True) if ruler_name else None
    co_ruler = _planet_summary(co_name,    planets, include_dispositor=True) if co_name    else None

    residents       = [_planet_summary(r["name"], planets, include_dispositor=True)
                       for r in _planets_in_house(planets, sphere_num)]
    resident_names  = {r["name"] for r in residents}

    aspects_to_ruler    = _aspects_involving(aspects, {ruler_name})[:15] if ruler_name else []
    aspects_to_co_ruler = _aspects_involving(aspects, {co_name})[:10]    if co_name    else []
    # Per-planet cap of 10, total scales with number of residents
    _per_resident_cap = 10
    resident_aspects    = _aspects_involving(aspects, resident_names)[:max(15, len(residents) * _per_resident_cap)]

    # ── Virtual points context (Lilith, Selena, Chiron) ──────────────────────
    all_sphere_names = resident_names | ({ruler_name} if ruler_name else set())
    virtual_points = _virtual_point_context(planets, aspects, sphere_num, all_sphere_names)

    # ── Layer 2: Aspect synthesis per planet ──────────────────────────────────
    ruler_synthesis = None
    if ruler and ruler_name:
        ruler_synthesis = build_planet_synthesis(
            ruler_name, aspects_to_ruler, ruler.get("dispositor")
        )

    co_ruler_synthesis = None
    if co_ruler and co_name:
        co_ruler_synthesis = build_planet_synthesis(
            co_name, aspects_to_co_ruler, co_ruler.get("dispositor")
        )

    resident_syntheses: list[dict] = []
    for res in residents:
        res_name = res["name"]
        res_asps = _aspects_involving(aspects, {res_name})[:15]
        resident_syntheses.append(
            build_planet_synthesis(res_name, res_asps, res.get("dispositor"))
        )

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

    # ── cross_element: modality + element of cusp sign ───────────────────────
    cross_element = CROSS_ELEMENT.get(cusp_sign, {"cross": "unknown", "element": "unknown"})

    # ── ruler_to_residents: aspects between ruler and each resident ───────────
    ruler_to_residents: list[dict] = []
    if ruler_name and resident_names:
        ruler_to_residents = [
            a for a in aspects
            if (a["planet_a"] == ruler_name and a["planet_b"] in resident_names)
            or (a["planet_b"] == ruler_name and a["planet_a"] in resident_names)
        ]

    # ── chain_narrative: pre-built string describing the chain of command ─────
    chain_narrative = ""
    if ruler:
        ruler_sign = ruler.get("sign", "")
        ruler_house = ruler.get("house", "")
        ruler_dignity = ruler.get("dignity_score", 0)
        parts = [f"{ruler_name.capitalize()} (управитель) в {ruler_sign} дом {ruler_house} (dignity {ruler_dignity:+d})"]
        disp = ruler.get("dispositor")
        if disp:
            disp_sign = disp.get("sign", "")
            disp_house = disp.get("house", "")
            disp_dignity = disp.get("dignity_score", 0)
            disp_retro = " ℞" if disp.get("retrograde") else ""
            parts.append(
                f"управляется {disp['name'].capitalize()} в {disp_sign} дом {disp_house} (dignity {disp_dignity:+d}{disp_retro})"
            )
        chain_narrative = ", ".join(parts)

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
        "out_of_bounds_here":   oob_here,
        "intercepted_sign":     intercepted_here,
        # Layer 2: aspect synthesis scaffolds
        "ruler_synthesis":      ruler_synthesis,
        "co_ruler_synthesis":   co_ruler_synthesis,
        "resident_syntheses":   resident_syntheses,
        "virtual_points":       virtual_points,   # Lilith/Selena/Chiron in this sphere
        # Ultimate Synthesis Engine extras
        "cross_element":        cross_element,
        "ruler_to_residents":   ruler_to_residents,
        "chain_narrative":      chain_narrative,
        "_target_min":          min_ins,
        "_target_max":          max_ins,
    }


def prepare_all_sphere_contexts(chart: dict) -> dict[int, dict]:
    """Returns all 12 isolated sphere contexts keyed by sphere number."""
    return {n: extract_sphere_context(chart, n) for n in range(1, 13)}
