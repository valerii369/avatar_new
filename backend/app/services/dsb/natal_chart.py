"""
natal_chart.py — Layer 1: Natal Chart Calculation
Swiss Ephemeris (pyswisseph) for planet positions.
"""
import anyio
import httpx
import logging
from datetime import datetime
from itertools import combinations

import os
import pytz
import swisseph as swe
from timezonefinder import TimezoneFinder

from app.core.db import get_supabase

logger = logging.getLogger(__name__)

# Set ephemeris path at module load — must happen before any swe.calc_ut()
# natal_chart.py is at: backend/app/services/dsb/natal_chart.py
# ephe dir is at:       backend/app/ephe/
# So: __file__/../../ephe/
_this_dir = os.path.dirname(os.path.abspath(__file__))
_ephe_dir = os.path.normpath(os.path.join(_this_dir, "..", "..", "ephe"))
swe.set_ephe_path(_ephe_dir)
_se1_count = len([f for f in os.listdir(_ephe_dir) if f.endswith(".se1")]) if os.path.isdir(_ephe_dir) else 0
logger.info(f"natal_chart: swe.set_ephe_path({_ephe_dir}) — {_se1_count} .se1 files")

limiter = anyio.CapacityLimiter(20)
tf = TimezoneFinder()

# ─── Celestial bodies ─────────────────────────────────────────────────────────

PLANETS = {
    "sun":        swe.SUN,
    "moon":       swe.MOON,
    "mercury":    swe.MERCURY,
    "venus":      swe.VENUS,
    "mars":       swe.MARS,
    "jupiter":    swe.JUPITER,
    "saturn":     swe.SATURN,
    "uranus":     swe.URANUS,
    "neptune":    swe.NEPTUNE,
    "pluto":      swe.PLUTO,
    "north_node": swe.TRUE_NODE,
    "chiron":     swe.CHIRON,
    "lilith":     swe.MEAN_APOG,
}

ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

ELEMENTS = {
    "fire":  ["Aries", "Leo", "Sagittarius"],
    "earth": ["Taurus", "Virgo", "Capricorn"],
    "air":   ["Gemini", "Libra", "Aquarius"],
    "water": ["Cancer", "Scorpio", "Pisces"],
}

MODALITIES = {
    "cardinal": ["Aries", "Cancer", "Libra", "Capricorn"],
    "fixed":    ["Taurus", "Leo", "Scorpio", "Aquarius"],
    "mutable":  ["Gemini", "Virgo", "Sagittarius", "Pisces"],
}

PERSONAL_PLANETS = {"sun", "moon", "mercury", "venus", "mars"}
ANGULAR_HOUSES   = {1, 4, 7, 10}

# Points that are derived/fixed — skip for balance & mutual reception
DERIVED_POINTS = {"asc", "mc", "part_of_fortune", "south_node"}
# Points where retrograde/stationary doesn't apply
NO_STATION_POINTS = {"asc", "mc", "part_of_fortune", "south_node", "north_node",
                     "sun", "moon", "lilith"}

# ─── Rulerships ───────────────────────────────────────────────────────────────

SIGN_RULERSHIPS = {
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

# ─── Essential Dignity ────────────────────────────────────────────────────────

DIGNITY_TABLE = {
    "sun":     {"domicile": ["Leo"],              "exaltation": ["Aries"],      "detriment": ["Aquarius"],              "fall": ["Libra"]},
    "moon":    {"domicile": ["Cancer"],           "exaltation": ["Taurus"],     "detriment": ["Capricorn"],             "fall": ["Scorpio"]},
    "mercury": {"domicile": ["Gemini", "Virgo"],  "exaltation": ["Virgo"],      "detriment": ["Sagittarius", "Pisces"], "fall": ["Pisces"]},
    "venus":   {"domicile": ["Taurus", "Libra"],  "exaltation": ["Pisces"],     "detriment": ["Aries", "Scorpio"],      "fall": ["Virgo"]},
    "mars":    {"domicile": ["Aries", "Scorpio"], "exaltation": ["Capricorn"],  "detriment": ["Taurus", "Libra"],       "fall": ["Cancer"]},
    "jupiter": {"domicile": ["Sagittarius", "Pisces"], "exaltation": ["Cancer"],"detriment": ["Gemini", "Virgo"],       "fall": ["Capricorn"]},
    "saturn":  {"domicile": ["Capricorn", "Aquarius"], "exaltation": ["Libra"], "detriment": ["Cancer", "Leo"],         "fall": ["Aries"]},
    "uranus":  {"domicile": ["Aquarius"],         "exaltation": [],             "detriment": ["Leo"],                   "fall": []},
    "neptune": {"domicile": ["Pisces"],           "exaltation": [],             "detriment": ["Virgo"],                 "fall": []},
    "pluto":   {"domicile": ["Scorpio"],          "exaltation": [],             "detriment": ["Taurus"],                "fall": []},
}

def calc_dignity_score(planet_name: str, sign: str) -> int:
    table = DIGNITY_TABLE.get(planet_name)
    if not table:
        return 0
    if sign in table.get("domicile", []):   return 5
    if sign in table.get("exaltation", []): return 4
    if sign in table.get("detriment", []):  return -5
    if sign in table.get("fall", []):       return -4
    return 0

# ─── Stationary thresholds per planet (°/day) ────────────────────────────────

STATIONARY_THRESHOLD: dict[str, float] = {
    "mercury": 0.20,
    "venus":   0.10,
    "mars":    0.08,
    "jupiter": 0.03,
    "saturn":  0.02,
    "uranus":  0.01,
    "neptune": 0.008,
    "pluto":   0.005,
    "chiron":  0.02,
}

def is_stationary(planet_name: str, speed: float) -> bool:
    if planet_name in NO_STATION_POINTS:
        return False
    threshold = STATIONARY_THRESHOLD.get(planet_name, 0.05)
    return abs(speed) <= threshold

# ─── Aspects ──────────────────────────────────────────────────────────────────

ASPECT_DEFS = [
    {"type": "conjunction",    "angle": 0,   "orb": 8.0},
    {"type": "opposition",     "angle": 180, "orb": 8.0},
    {"type": "trine",          "angle": 120, "orb": 6.0},
    {"type": "square",         "angle": 90,  "orb": 6.0},
    {"type": "sextile",        "angle": 60,  "orb": 4.0},
    {"type": "quincunx",       "angle": 150, "orb": 3.0},
    {"type": "semisextile",    "angle": 30,  "orb": 2.0},
    {"type": "semisquare",     "angle": 45,  "orb": 2.0},
    {"type": "sesquiquadrate", "angle": 135, "orb": 2.0},
    {"type": "quintile",       "angle": 72,  "orb": 1.5},
    {"type": "biquintile",     "angle": 144, "orb": 1.5},
]

# Fixed points in the natal chart — applying/separating not applicable
FIXED_POINTS = DERIVED_POINTS | {"lilith"}

def angular_distance(lon_a: float, lon_b: float) -> float:
    """Shortest arc between two ecliptic longitudes (0–180°)."""
    diff = abs(lon_a - lon_b) % 360
    return diff if diff <= 180 else 360 - diff

def is_applying(
    lon_a: float, lon_b: float,
    speed_a: float, speed_b: float,
    aspect_angle: float,
) -> bool:
    """True if the orb is closing (aspect is applying).
    Projects positions 1 hour forward and compares distance to aspect angle.
    """
    current = abs(angular_distance(lon_a, lon_b) - aspect_angle)
    future_a = (lon_a + speed_a / 24) % 360
    future_b = (lon_b + speed_b / 24) % 360
    future  = abs(angular_distance(future_a, future_b) - aspect_angle)
    return future < current

def _orb_limit(pa: str, pb: str, base_orb: float, angle: float) -> float:
    """Widen orb for luminaries and personal-planet pairs."""
    orb = base_orb
    # Sun or Moon conjunct/opposite — up to 10°
    if angle in (0, 180) and ("sun" in {pa, pb} or "moon" in {pa, pb}):
        orb = max(orb, 10.0)
    # Both personal planets — +1°
    elif pa in PERSONAL_PLANETS and pb in PERSONAL_PLANETS:
        orb += 1.0
    return orb

def calc_influence_weight(pa: str, pb: str, orb: float, orb_limit: float) -> float:
    personal_bonus = 0.15 if (pa in PERSONAL_PLANETS or pb in PERSONAL_PLANETS) else 0.0
    angle_bonus    = 0.10 if (pa in {"asc", "mc"} or pb in {"asc", "mc"}) else 0.0
    exactness      = max(0.0, 1.0 - orb / orb_limit)
    return round(min(1.0, 0.5 + personal_bonus + angle_bonus + exactness * 0.35), 2)

def calc_aspects(planets: dict) -> list[dict]:
    aspect_list = []
    names = list(planets.keys())

    for pa, pb in combinations(names, 2):
        lon_a = planets[pa]["longitude"]
        lon_b = planets[pb]["longitude"]
        dist  = angular_distance(lon_a, lon_b)

        for asp in ASPECT_DEFS:
            angle = asp["angle"]
            limit = _orb_limit(pa, pb, asp["orb"], angle)
            actual_orb = abs(dist - angle)
            if actual_orb > limit:
                continue

            if pa in FIXED_POINTS or pb in FIXED_POINTS:
                applying = False
            else:
                applying = is_applying(
                    lon_a, lon_b,
                    planets[pa]["speed"], planets[pb]["speed"],
                    angle,
                )

            aspect_list.append({
                "planet_a":         pa,
                "planet_b":         pb,
                "type":             asp["type"],
                "angle":            angle,
                "orb":              round(actual_orb, 2),
                "applying":         applying,
                "influence_weight": calc_influence_weight(pa, pb, actual_orb, limit),
            })
            break  # one aspect per pair (strongest match first in ASPECT_DEFS)

    aspect_list.sort(key=lambda x: x["influence_weight"], reverse=True)
    return aspect_list

# ─── Stelliums ────────────────────────────────────────────────────────────────

def calc_stelliums(planets: dict) -> list[dict]:
    from collections import defaultdict
    by_sign:  dict[str, list] = defaultdict(list)
    by_house: dict[int, list] = defaultdict(list)

    for name, data in planets.items():
        if name in DERIVED_POINTS:
            continue
        by_sign[data["sign"]].append(name)
        by_house[data["house"]].append(name)

    stelliums = []
    for sign, members in by_sign.items():
        if len(members) >= 3:
            stelliums.append({"type": "sign", "sign": sign, "planets": members})
    for house, members in by_house.items():
        if len(members) >= 3:
            stelliums.append({"type": "house", "house": house, "planets": members})
    return stelliums

# ─── Critical Degrees ─────────────────────────────────────────────────────────

CRITICAL_DEGREES: dict[str, list[int]] = {
    "cardinal": [0, 13, 26],
    "fixed":    [8, 9, 21, 22],
    "mutable":  [4, 17],
}

def get_modality(sign: str) -> str:
    for mod, signs in MODALITIES.items():
        if sign in signs:
            return mod
    return ""

def calc_critical_degrees(planets: dict) -> list[str]:
    critical = []
    for name, data in planets.items():
        if name in DERIVED_POINTS:
            continue
        deg  = data["degree_in_sign"]
        mod  = get_modality(data["sign"])
        thresholds = CRITICAL_DEGREES.get(mod, [])
        if any(abs(deg - t) <= 1.0 for t in thresholds):
            critical.append(name)
        elif deg >= 28.5:
            critical.append(name)
    return critical

# ─── Aspect Patterns ──────────────────────────────────────────────────────────

def calc_aspect_patterns(aspects: list[dict]) -> list[str]:
    patterns: list[str] = []
    by_type: dict[str, list] = {}
    for asp in aspects:
        by_type.setdefault(asp["type"], []).append(asp)

    trines   = by_type.get("trine", [])
    squares  = by_type.get("square", [])
    sextiles = by_type.get("sextile", [])
    opps     = by_type.get("opposition", [])
    quincunx = by_type.get("quincunx", [])

    # ── Grand Trine ───────────────────────────────────────────────────────────
    trine_planets: set = set()
    for asp in trines:
        trine_planets.update([asp["planet_a"], asp["planet_b"]])

    grand_trines: list[tuple] = []
    for combo in combinations(trine_planets, 3):
        combo_set = set(combo)
        count = sum(
            1 for asp in trines
            if asp["planet_a"] in combo_set and asp["planet_b"] in combo_set
        )
        if count >= 3:
            grand_trines.append(combo)
            patterns.append(f"Grand Trine ({', '.join(combo)})")

    # ── Kite (Grand Trine + opposition from one apex + 2 sextiles) ───────────
    for trio in grand_trines:
        trio_set = set(trio)
        found_kite = False
        for apex in trio:
            if found_kite:
                break
            for opp in opps:
                if apex not in {opp["planet_a"], opp["planet_b"]}:
                    continue
                kite_pt = opp["planet_b"] if opp["planet_a"] == apex else opp["planet_a"]
                if kite_pt in trio_set:
                    continue
                others = [p for p in trio if p != apex]
                sext_count = sum(
                    1 for s in sextiles
                    if kite_pt in {s["planet_a"], s["planet_b"]} and (
                        others[0] in {s["planet_a"], s["planet_b"]} or
                        others[1] in {s["planet_a"], s["planet_b"]}
                    )
                )
                if sext_count >= 2:
                    patterns.append(f"Kite ({', '.join(trio)}, kite_point {kite_pt})")
                    found_kite = True
                    break

    # ── T-Square ──────────────────────────────────────────────────────────────
    for opp in opps:
        pa, pb = opp["planet_a"], opp["planet_b"]
        apex_candidates: set = set()
        for sq in squares:
            pair = {sq["planet_a"], sq["planet_b"]}
            if pa in pair:
                apex_candidates.add(sq["planet_b"] if sq["planet_a"] == pa else sq["planet_a"])
        for apex in apex_candidates:
            if any(
                sq["planet_a"] in {pb, apex} and sq["planet_b"] in {pb, apex}
                for sq in squares
            ):
                patterns.append(f"T-Square ({pa}, {pb}, apex {apex})")
                break

    # ── Grand Cross ───────────────────────────────────────────────────────────
    opp_sets = [frozenset([o["planet_a"], o["planet_b"]]) for o in opps]
    for o1, o2 in combinations(opp_sets, 2):
        all_four = o1 | o2
        if len(all_four) == 4:
            sq_count = sum(
                1 for sq in squares
                if sq["planet_a"] in all_four and sq["planet_b"] in all_four
            )
            if sq_count >= 4:
                patterns.append(f"Grand Cross ({', '.join(sorted(all_four))})")
                break

    # ── Yod (Finger of God) ───────────────────────────────────────────────────
    for sext in sextiles:
        pa, pb = sext["planet_a"], sext["planet_b"]
        apex_a = {
            (q["planet_b"] if q["planet_a"] == pa else q["planet_a"])
            for q in quincunx if pa in {q["planet_a"], q["planet_b"]}
        }
        apex_b = {
            (q["planet_b"] if q["planet_a"] == pb else q["planet_a"])
            for q in quincunx if pb in {q["planet_a"], q["planet_b"]}
        }
        common_apex = (apex_a & apex_b) - {pa, pb}  # parentheses fix operator precedence
        for apex in common_apex:
            patterns.append(f"Yod ({pa}, {pb}, apex {apex})")
            break

    return patterns

# ─── Chart Balance ────────────────────────────────────────────────────────────

def calc_chart_balance(planets: dict) -> dict:
    elements   = {"fire": 0, "earth": 0, "air": 0, "water": 0}
    modalities = {"cardinal": 0, "fixed": 0, "mutable": 0}
    north, south, east, west = 0, 0, 0, 0

    for name, data in planets.items():
        if name in DERIVED_POINTS:
            continue
        sign  = data["sign"]
        house = data["house"]

        for elem, signs in ELEMENTS.items():
            if sign in signs:
                elements[elem] += 1

        for mod, signs in MODALITIES.items():
            if sign in signs:
                modalities[mod] += 1

        # Above horizon (houses 7–12) = northern hemisphere
        (north if house >= 7 else south).__class__  # trick to avoid if/else
        if house >= 7:
            north += 1
        else:
            south += 1

        # Eastern hemisphere (houses 10–12, 1–3)
        if house in {10, 11, 12, 1, 2, 3}:
            east += 1
        else:
            west += 1

    dom_elem = max(elements,   key=elements.get)
    dom_mod  = max(modalities, key=modalities.get)

    return {
        "elements":          elements,
        "modalities":        modalities,
        "hemispheres":       {"north": north, "south": south, "east": east, "west": west},
        "dominant_element":  dom_elem,
        "dominant_modality": dom_mod,
        "chart_emphasis":    "above_horizon" if north > south else "below_horizon",
    }

# ─── Mutual Reception ─────────────────────────────────────────────────────────

_SKIP_RECEPTION = DERIVED_POINTS | {"north_node", "south_node", "lilith", "chiron"}

def calc_mutual_receptions(planets: dict) -> list[dict]:
    """Detect mutual receptions: planet A in sign ruled by B, and B in sign ruled by A."""
    core = [n for n in planets if n not in _SKIP_RECEPTION]
    receptions = []
    for pa, pb in combinations(core, 2):
        sign_a   = planets[pa]["sign"]
        sign_b   = planets[pb]["sign"]
        ruler_a  = SIGN_RULERSHIPS.get(sign_a)
        ruler_b  = SIGN_RULERSHIPS.get(sign_b)
        if ruler_a == pb and ruler_b == pa:
            receptions.append({
                "planet_a": pa, "sign_a": sign_a,
                "planet_b": pb, "sign_b": sign_b,
            })
    return receptions

# ─── Position Weight (pre-computed for Layer 2) ───────────────────────────────

def calc_position_weight(planet_name: str, data: dict, aspects: list) -> float:
    """
    Algorithmically computed significance score (0.0–1.0) for each position.
    Layer 2 uses this directly — GPT does not re-compute it.
    """
    w = 0.5
    if planet_name in PERSONAL_PLANETS:
        w += 0.20
    if planet_name in {"asc", "mc"}:
        w += 0.15  # chart angles are always significant
    if data.get("house") in ANGULAR_HOUSES:
        w += 0.15
    # Exact aspect involvement
    if any(
        planet_name in {asp["planet_a"], asp["planet_b"]} and asp["orb"] < 1.0
        for asp in aspects
    ):
        w += 0.10
    ds = data.get("dignity_score", 0)
    if ds >= 4:   w += 0.10
    if ds <= -4:  w += 0.10
    if data.get("retrograde"):
        w -= 0.05
    if data.get("stationary"):
        w += 0.08  # stationary planets are intensified
    return round(min(1.0, max(0.0, w)), 2)

# ─── Geocode ──────────────────────────────────────────────────────────────────

async def geocode(place: str) -> tuple[float, float, str]:
    try:
        supabase = get_supabase()
        cached = supabase.table("geocode_cache").select("lat,lon,timezone").eq("city_name", place).execute()
        if cached.data:
            return cached.data[0]["lat"], cached.data[0]["lon"], cached.data[0]["timezone"]
    except Exception as e:
        logger.warning(f"Geocode cache read failed: {e}")
        supabase = None

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": place, "format": "json", "limit": 1},
            headers={"User-Agent": "AVATAR_v2.1_Backend/1.0"},
        )
        data = resp.json()
        if not data:
            raise ValueError(f"Could not geocode: {place}")
        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])

    tz_str = tf.timezone_at(lat=lat, lng=lon) or "UTC"

    if supabase:
        try:
            supabase.table("geocode_cache").insert(
                {"city_name": place, "lat": lat, "lon": lon, "timezone": tz_str}
            ).execute()
        except Exception as e:
            logger.warning(f"Geocode cache write failed: {e}")

    return lat, lon, tz_str

# ─── Swiss Ephemeris helpers ──────────────────────────────────────────────────

def _ensure_ephe():
    """Set ephemeris path before every Swiss Ephemeris call."""
    swe.set_ephe_path(_ephe_dir)

async def _calc_planet(jd: float, planet_id: int):
    async with limiter:
        def _do():
            _ensure_ephe()
            return swe.calc_ut(jd, planet_id)
        return await anyio.to_thread.run_sync(_do)

def _calc_houses_sync(jd: float, lat: float, lon: float):
    _ensure_ephe()
    try:
        houses, angles = swe.houses(jd, lat, lon, b"P")
        return houses, angles, "placidus"
    except Exception:
        logger.warning("Placidus failed — falling back to Whole Sign")
        houses, angles = swe.houses(jd, lat, lon, b"W")
        return houses, angles, "whole_sign"

async def _calc_houses(jd: float, lat: float, lon: float):
    async with limiter:
        return await anyio.to_thread.run_sync(lambda: _calc_houses_sync(jd, lat, lon))

def _longitude_to_house(longitude: float, houses: tuple) -> int:
    """Map an ecliptic longitude to the correct house number (1–12)."""
    lon = longitude % 360
    for i in range(12):
        c1 = houses[i] % 360
        c2 = houses[(i + 1) % 12] % 360
        if c1 < c2:
            if c1 <= lon < c2:
                return i + 1
        else:  # cusp wraps through 0°
            if lon >= c1 or lon < c2:
                return i + 1
    return 1  # fallback (should not happen)

# ─── Main entry point ─────────────────────────────────────────────────────────

async def calculate_chart(birth_date: str, birth_time: str, place: str) -> dict:
    """Full natal chart calculation. Returns structured dict for Layer 2."""
    lat, lon, tz_str = await geocode(place)

    local_tz = pytz.timezone(tz_str)
    dt       = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
    local_dt = local_tz.localize(dt)
    utc_dt   = local_dt.astimezone(pytz.utc)

    # Julian Day including seconds for maximum precision
    jd = swe.julday(
        utc_dt.year, utc_dt.month, utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0,
    )

    houses_tuple, angles_tuple, house_system = await _calc_houses(jd, lat, lon)
    asc_lon = angles_tuple[0] % 360
    mc_lon  = angles_tuple[1] % 360

    # ── Planet positions ──────────────────────────────────────────────────────
    chart_planets: dict = {}

    for planet_name, planet_id in PLANETS.items():
        res       = await _calc_planet(jd, planet_id)
        longitude = res[0][0] % 360
        speed     = res[0][3]
        sign_idx  = int(longitude // 30)
        sign      = ZODIAC_SIGNS[sign_idx]

        # True Node oscillates — don't infer retrograde from speed
        retrograde = (speed < 0) if planet_name != "north_node" else False
        stationary = is_stationary(planet_name, speed)

        chart_planets[planet_name] = {
            "longitude":      round(longitude, 4),
            "sign":           sign,
            "degree_in_sign": round(longitude % 30, 2),
            "house":          _longitude_to_house(longitude, houses_tuple),
            "retrograde":     retrograde,
            "stationary":     stationary,
            "speed":          round(speed, 4),
            "dignity_score":  calc_dignity_score(planet_name, sign),
        }

    # ── South Node (North Node + 180°) ────────────────────────────────────────
    sn_lon  = (chart_planets["north_node"]["longitude"] + 180) % 360
    sn_sign = ZODIAC_SIGNS[int(sn_lon // 30)]
    chart_planets["south_node"] = {
        "longitude":      round(sn_lon, 4),
        "sign":           sn_sign,
        "degree_in_sign": round(sn_lon % 30, 2),
        "house":          _longitude_to_house(sn_lon, houses_tuple),
        "retrograde":     False,
        "stationary":     False,
        "speed":          0.0,
        "dignity_score":  0,
    }

    # ── ASC and MC ────────────────────────────────────────────────────────────
    for angle_name, angle_lon, angle_house in (("asc", asc_lon, 1), ("mc", mc_lon, 10)):
        sign = ZODIAC_SIGNS[int(angle_lon // 30)]
        chart_planets[angle_name] = {
            "longitude":      round(angle_lon, 4),
            "sign":           sign,
            "degree_in_sign": round(angle_lon % 30, 2),
            "house":          angle_house,
            "retrograde":     False,
            "stationary":     False,
            "speed":          0.0,
            "dignity_score":  0,
            "is_angle":       True,
        }

    # ── Part of Fortune ───────────────────────────────────────────────────────
    sun_lon  = chart_planets["sun"]["longitude"]
    moon_lon = chart_planets["moon"]["longitude"]
    is_day   = chart_planets["sun"]["house"] >= 7  # Sun above horizon
    pof_lon  = (asc_lon + moon_lon - sun_lon) % 360 if is_day \
               else (asc_lon + sun_lon - moon_lon) % 360
    pof_sign = ZODIAC_SIGNS[int(pof_lon // 30)]
    chart_planets["part_of_fortune"] = {
        "longitude":      round(pof_lon, 4),
        "sign":           pof_sign,
        "degree_in_sign": round(pof_lon % 30, 2),
        "house":          _longitude_to_house(pof_lon, houses_tuple),
        "retrograde":     False,
        "stationary":     False,
        "speed":          0.0,
        "dignity_score":  0,
        "is_angle":       True,
    }

    # ── Derived calculations ──────────────────────────────────────────────────
    aspects         = calc_aspects(chart_planets)
    stelliums       = calc_stelliums(chart_planets)
    critical_degs   = calc_critical_degrees(chart_planets)
    aspect_patterns = calc_aspect_patterns(aspects)
    balance         = calc_chart_balance(chart_planets)
    mutual_recs     = calc_mutual_receptions(chart_planets)

    # ── Pre-compute position_weight for every point ───────────────────────────
    for name, data in chart_planets.items():
        data["position_weight"] = calc_position_weight(name, data, aspects)

    return {
        "meta": {
            "house_system":  house_system,
            "node_type":     "true_node",
            "is_day_chart":  is_day,
            "timezone":      tz_str,
            "calculated_at": datetime.utcnow().isoformat(),
        },
        "planets":           chart_planets,
        "houses":            {str(i + 1): {"cusp": round(houses_tuple[i], 4)} for i in range(12)},
        "angles":            {"asc": round(asc_lon, 4), "mc": round(mc_lon, 4)},
        "aspects":           aspects,
        "aspect_patterns":   aspect_patterns,
        "stelliums":         stelliums,
        "critical_degrees":  critical_degs,
        "balance":           balance,
        "mutual_receptions": mutual_recs,
    }
