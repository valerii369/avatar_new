"""
aspect_synthesis.py — Layer 2: Multi-Layered Aspect Synthesis

Builds a structured interpretation scaffold for a planet.
The scaffold tells the LLM *where* each aspect's energy belongs:
  - tense   → shadow_aspect, developmental_task, triggers
  - harmoni → light_aspect, gift, insight
  - amplif  → amplifies the base planet meaning (positive or negative)
"""
from __future__ import annotations
from app.data.aspect_pairs import get_pair_meaning, aspect_category

# ── Coalitions ─────────────────────────────────────────────────────────────────
_DHARMA  = {"sun", "moon", "mars", "jupiter"}
_ARTHA   = {"mercury", "venus", "saturn"}
_NEUTRAL = {"uranus", "neptune", "pluto", "chiron", "lilith",
            "north_node", "south_node", "asc", "mc", "part_of_fortune"}

def _coalition(planet: str) -> str:
    if planet in _DHARMA:  return "dharma"
    if planet in _ARTHA:   return "artha"
    return "neutral"

def _coalition_relation(pa: str, pb: str) -> str:
    """ally | enemy | neutral"""
    ca, cb = _coalition(pa), _coalition(pb)
    if ca == "neutral" or cb == "neutral":
        return "neutral"
    return "ally" if ca == cb else "enemy"

# ── Intensity by orb ───────────────────────────────────────────────────────────
def _intensity(orb: float) -> str:
    if orb <= 1.0:  return "critical"   # впечатан навсегда
    if orb <= 2.5:  return "strong"
    if orb <= 5.0:  return "moderate"
    return "background"

# ── Aspect type weights (for sorting significance) ────────────────────────────
_TYPE_WEIGHT = {
    "conjunction": 1.0,
    "opposition":  0.9,
    "square":      0.85,
    "trine":       0.8,
    "sextile":     0.65,
}

def _significance(asp: dict) -> float:
    type_w = _TYPE_WEIGHT.get(asp.get("type", ""), 0.5)
    orb    = asp.get("orb", 5.0)
    # Tight orb multiplies significance
    orb_factor = max(0.2, 1.0 - orb / 8.0)
    return round(type_w * orb_factor, 3)


# ── Trigger templates per aspect type ─────────────────────────────────────────
_TRIGGER_HINTS: dict[str, str] = {
    "square":      "ситуации прямого столкновения или вынужденного выбора",
    "opposition":  "ситуации, где нужно удерживать два полюса одновременно",
    "conjunction": "моменты концентрации и слияния двух энергий",
    "trine":       "ситуации, где талант проявляется без усилий",
    "sextile":     "возможности, требующие осознанного шага навстречу",
}

# ── Planet display names (RU) ──────────────────────────────────────────────────
_PLANET_RU: dict[str, str] = {
    "sun": "Солнце", "moon": "Луна", "mercury": "Меркурий",
    "venus": "Венера", "mars": "Марс", "jupiter": "Юпитер",
    "saturn": "Сатурн", "uranus": "Уран", "neptune": "Нептун",
    "pluto": "Плутон", "north_node": "С.Узел", "south_node": "Ю.Узел",
    "chiron": "Хирон", "lilith": "Лилит", "asc": "АСЦ", "mc": "МС",
}

_ASPECT_RU: dict[str, str] = {
    "conjunction": "Соединение", "opposition": "Оппозиция",
    "trine": "Тригон", "square": "Квадрат", "sextile": "Секстиль",
}


def build_planet_synthesis(
    planet_name: str,
    aspects: list[dict],
    dispositor: dict | None = None,
) -> dict:
    """
    Build a multi-layered interpretation scaffold for a single planet.

    Args:
        planet_name:  e.g. "mars"
        aspects:      list of aspect dicts involving this planet
                      (each dict: planet_a, planet_b, type, orb, applying)
        dispositor:   optional dispositor dict from sphere_context

    Returns a dict with keys:
        target, tense, harmonious, amplifiers,
        dispositor_quality, shadow_drivers, light_drivers,
        trigger_drivers, top_modifiers
    """
    tense:      list[dict] = []
    harmonious: list[dict] = []
    amplifiers: list[dict] = []

    for asp in aspects:
        # Identify the "other" planet in the aspect
        other = asp["planet_b"] if asp["planet_a"] == planet_name else asp["planet_a"]
        cat   = aspect_category(asp.get("type", ""))
        meaning = get_pair_meaning(planet_name, other, asp.get("type", ""))
        coalition_rel = _coalition_relation(planet_name, other)
        orb   = asp.get("orb", 5.0)
        entry = {
            "planet":        other,
            "planet_ru":     _PLANET_RU.get(other, other),
            "type":          asp.get("type"),
            "type_ru":       _ASPECT_RU.get(asp.get("type", ""), asp.get("type", "")),
            "orb":           orb,
            "applying":      asp.get("applying", False),
            "intensity":     _intensity(orb),
            "significance":  _significance(asp),
            "coalition":     coalition_rel,
            "pair_meaning":  meaning,
            "trigger_hint":  _TRIGGER_HINTS.get(asp.get("type", ""), ""),
        }

        if cat == "tense":
            tense.append(entry)
        elif cat == "harmonious":
            harmonious.append(entry)
        elif cat == "conjunction":
            amplifiers.append(entry)

    # Sort each group by significance descending
    tense.sort(key=lambda x: -x["significance"])
    harmonious.sort(key=lambda x: -x["significance"])
    amplifiers.sort(key=lambda x: -x["significance"])

    # ── Dispositor quality ─────────────────────────────────────────────────────
    disp_quality = "neutral"
    disp_note    = ""
    if dispositor:
        ds = dispositor.get("dignity_score", 0)
        retro = dispositor.get("retrograde", False)
        disp_name = _PLANET_RU.get(dispositor.get("name", ""), dispositor.get("name", ""))
        disp_sign = dispositor.get("sign", "")
        if ds >= 4:
            disp_quality = "empowered"
            disp_note = f"{disp_name} в {disp_sign} (dignity {ds}) — планета-управитель в силе, энергия передаётся чисто."
        elif ds >= 1:
            disp_quality = "supportive"
            disp_note = f"{disp_name} в {disp_sign} — управитель достаточно силён, поддерживает."
        elif retro:
            disp_quality = "weakened"
            disp_note = f"{disp_name} ℞ в {disp_sign} — управитель ретроградный, энергия идёт внутрь, рассеивается."
        elif ds <= -4:
            disp_quality = "debilitated"
            disp_note = f"{disp_name} в {disp_sign} (dignity {ds}) — управитель в падении/изгнании, энергия искажается."
        elif ds <= -1:
            disp_quality = "strained"
            disp_note = f"{disp_name} в {disp_sign} — управитель ослаблен, действует через сопротивление."
        else:
            disp_quality = "neutral"
            disp_note = f"{disp_name} в {disp_sign} — управитель в нейтральном положении."

    # ── Pre-built narrative drivers (guidance for LLM) ─────────────────────────
    planet_ru = _PLANET_RU.get(planet_name, planet_name)

    shadow_drivers: list[str] = []
    for a in tense[:3]:
        base = f"{a['type_ru']} {planet_ru}–{a['planet_ru']} (orb {a['orb']}°, {a['intensity']})"
        if a["coalition"] == "enemy":
            base += " — враждебная коалиция, искажение максимально"
        if a["pair_meaning"]:
            base += f": {a['pair_meaning']}"
        shadow_drivers.append(base)

    light_drivers: list[str] = []
    for a in harmonious[:3]:
        base = f"{a['type_ru']} {planet_ru}–{a['planet_ru']} (orb {a['orb']}°, {a['intensity']})"
        if a["coalition"] == "ally":
            base += " — союзная коалиция, усиление"
        if a["pair_meaning"]:
            base += f": {a['pair_meaning']}"
        light_drivers.append(base)

    amplifier_drivers: list[str] = []
    for a in amplifiers[:2]:
        tone = "СОЮЗ" if a["coalition"] == "ally" else ("ВРАГ" if a["coalition"] == "enemy" else "НЕЙТРАЛЬ")
        base = f"Соединение {planet_ru}–{a['planet_ru']} [{tone}] (orb {a['orb']}°, {a['intensity']})"
        if a["pair_meaning"]:
            base += f": {a['pair_meaning']}"
        amplifier_drivers.append(base)

    trigger_drivers: list[str] = []
    for a in (tense + harmonious + amplifiers)[:4]:
        hint = a["trigger_hint"]
        if hint:
            trigger_drivers.append(
                f"{a['type_ru']} {planet_ru}–{a['planet_ru']}: {hint}"
            )

    # Top-3 most significant aspects across all categories
    all_aspects = tense + harmonious + amplifiers
    top_modifiers = sorted(all_aspects, key=lambda x: -x["significance"])[:3]

    return {
        "target":            planet_name,
        "target_ru":         planet_ru,
        "tense":             tense,
        "harmonious":        harmonious,
        "amplifiers":        amplifiers,
        "dispositor_quality": disp_quality,
        "dispositor_note":   disp_note,
        # Narrative drivers — pre-structured guidance for each content block
        "shadow_drivers":    shadow_drivers,
        "light_drivers":     light_drivers,
        "amplifier_drivers": amplifier_drivers,
        "trigger_drivers":   trigger_drivers,
        "top_modifiers":     top_modifiers,
    }
