import os
import anyio
import swisseph as swe
from timezonefinder import TimezoneFinder
import pytz
from datetime import datetime, date, time
from app.core.db import get_supabase
import httpx
import logging
from itertools import combinations

logger = logging.getLogger(__name__)

limiter = anyio.CapacityLimiter(20)
tf = TimezoneFinder()

# Constants for Planets
PLANETS = {
    "sun": swe.SUN, "moon": swe.MOON, "mercury": swe.MERCURY, "venus": swe.VENUS,
    "mars": swe.MARS, "jupiter": swe.JUPITER, "saturn": swe.SATURN,
    "uranus": swe.URANUS, "neptune": swe.NEPTUNE, "pluto": swe.PLUTO,
    "north_node": swe.TRUE_NODE, "chiron": swe.CHIRON, "lilith": swe.MEAN_APOG
}

ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

ELEMENTS = {
    "fire": ["Aries", "Leo", "Sagittarius"],
    "earth": ["Taurus", "Virgo", "Capricorn"],
    "air": ["Gemini", "Libra", "Aquarius"],
    "water": ["Cancer", "Scorpio", "Pisces"]
}

MODALITIES = {
    "cardinal": ["Aries", "Cancer", "Libra", "Capricorn"],
    "fixed": ["Taurus", "Leo", "Scorpio", "Aquarius"],
    "mutable": ["Gemini", "Virgo", "Sagittarius", "Pisces"]
}

# ─── Dignity Lookup ───────────────────────────────────────────────────────────
DIGNITY_TABLE = {
    "sun":     {"domicile": ["Leo"], "exaltation": ["Aries"], "detriment": ["Aquarius"], "fall": ["Libra"]},
    "moon":    {"domicile": ["Cancer"], "exaltation": ["Taurus"], "detriment": ["Capricorn"], "fall": ["Scorpio"]},
    "mercury": {"domicile": ["Gemini", "Virgo"], "exaltation": ["Virgo"], "detriment": ["Sagittarius", "Pisces"], "fall": ["Pisces"]},
    "venus":   {"domicile": ["Taurus", "Libra"], "exaltation": ["Pisces"], "detriment": ["Aries", "Scorpio"], "fall": ["Virgo"]},
    "mars":    {"domicile": ["Aries", "Scorpio"], "exaltation": ["Capricorn"], "detriment": ["Taurus", "Libra"], "fall": ["Cancer"]},
    "jupiter": {"domicile": ["Sagittarius", "Pisces"], "exaltation": ["Cancer"], "detriment": ["Gemini", "Virgo"], "fall": ["Capricorn"]},
    "saturn":  {"domicile": ["Capricorn", "Aquarius"], "exaltation": ["Libra"], "detriment": ["Cancer", "Leo"], "fall": ["Aries"]},
    "uranus":  {"domicile": ["Aquarius"], "exaltation": [], "detriment": ["Leo"], "fall": []},
    "neptune": {"domicile": ["Pisces"], "exaltation": [], "detriment": ["Virgo"], "fall": []},
    "pluto":   {"domicile": ["Scorpio"], "exaltation": [], "detriment": ["Taurus"], "fall": []},
}

def calc_dignity_score(planet_name: str, sign: str) -> int:
    """Returns dignity score: +5 domicile, +4 exaltation, -5 detriment, -4 fall, 0 peregrine."""
    table = DIGNITY_TABLE.get(planet_name)
    if not table:
        return 0
    if sign in table.get("domicile", []):
        return 5
    if sign in table.get("exaltation", []):
        return 4
    if sign in table.get("detriment", []):
        return -5
    if sign in table.get("fall", []):
        return -4
    return 0

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

# Personal planets get wider orbs
PERSONAL_PLANETS = {"sun", "moon", "mercury", "venus", "mars"}

def angular_distance(lon_a: float, lon_b: float) -> float:
    """Returns the shortest angular distance between two ecliptic longitudes."""
    diff = abs(lon_a - lon_b) % 360
    return diff if diff <= 180 else 360 - diff

def calc_influence_weight(planet_a: str, planet_b: str, orb: float, exact_orb: float) -> float:
    """Estimate how important this aspect is (0.0–1.0)."""
    personal_bonus = 0.15 if (planet_a in PERSONAL_PLANETS or planet_b in PERSONAL_PLANETS) else 0.0
    exactness = max(0.0, 1.0 - orb / exact_orb)  # 1.0 if exact, 0.0 at edge of orb
    return round(min(1.0, 0.5 + personal_bonus + exactness * 0.35), 2)

def calc_aspects(planets: dict) -> list[dict]:
    """Compute all aspects between chart planets."""
    aspect_list = []
    planet_names = list(planets.keys())

    for pa, pb in combinations(planet_names, 2):
        lon_a = planets[pa]["longitude"]
        lon_b = planets[pb]["longitude"]
        dist = angular_distance(lon_a, lon_b)

        for asp in ASPECT_DEFS:
            angle = asp["angle"]
            orb_limit = asp["orb"]
            # Widen orb slightly if both are personal planets
            if pa in PERSONAL_PLANETS and pb in PERSONAL_PLANETS:
                orb_limit += 1.0
            actual_orb = abs(dist - angle)
            if actual_orb <= orb_limit:
                aspect_list.append({
                    "planet_a": pa,
                    "planet_b": pb,
                    "type": asp["type"],
                    "angle": angle,
                    "orb": round(actual_orb, 2),
                    "applying": planets[pa]["speed"] > planets[pb]["speed"],
                    "influence_weight": calc_influence_weight(pa, pb, actual_orb, orb_limit),
                })
                break  # one aspect per pair (strongest match)

    aspect_list.sort(key=lambda x: x["influence_weight"], reverse=True)
    return aspect_list

# ─── Stelliums ────────────────────────────────────────────────────────────────
def calc_stelliums(planets: dict) -> list[dict]:
    """Detect stelliums: 3+ planets in same sign or same house."""
    from collections import defaultdict
    by_sign = defaultdict(list)
    by_house = defaultdict(list)

    for name, data in planets.items():
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

# ─── Critical Degrees ────────────────────────────────────────────────────────
CRITICAL_DEGREES = {
    "cardinal": [0, 13, 26],   # Aries, Cancer, Libra, Capricorn
    "fixed":    [8, 9, 21, 22], # Taurus, Leo, Scorpio, Aquarius
    "mutable":  [4, 17],        # Gemini, Virgo, Sagittarius, Pisces
}

def get_modality(sign: str) -> str:
    for mod, signs in MODALITIES.items():
        if sign in signs:
            return mod
    return ""

def calc_critical_degrees(planets: dict) -> list[str]:
    """Returns list of planet names that sit on critical degrees."""
    critical = []
    for name, data in planets.items():
        deg = data["degree_in_sign"]
        mod = get_modality(data["sign"])
        thresholds = CRITICAL_DEGREES.get(mod, [])
        # Within 1 degree of a critical point
        if any(abs(deg - t) <= 1.0 for t in thresholds):
            critical.append(name)
        # Anaretic degree (29°) is always critical
        elif deg >= 28.5:
            critical.append(name)
    return critical

# ─── Aspect Patterns ─────────────────────────────────────────────────────────
def calc_aspect_patterns(aspects: list[dict]) -> list[str]:
    """Detect Grand Trine, T-Square, Grand Cross, Yod, Kite."""
    patterns = []
    by_type = {}
    for asp in aspects:
        t = asp["type"]
        if t not in by_type:
            by_type[t] = []
        by_type[t].append(asp)

    trines   = by_type.get("trine", [])
    squares  = by_type.get("square", [])
    sextiles = by_type.get("sextile", [])
    opps     = by_type.get("opposition", [])
    quincunx = by_type.get("quincunx", [])

    # Grand Trine: 3 planets all trine each other
    trine_planets = set()
    for asp in trines:
        trine_planets.add(asp["planet_a"])
        trine_planets.add(asp["planet_b"])
    for combo in combinations(trine_planets, 3):
        combo_set = set(combo)
        trine_count = sum(
            1 for asp in trines
            if asp["planet_a"] in combo_set and asp["planet_b"] in combo_set
        )
        if trine_count >= 3:
            patterns.append(f"Grand Trine ({', '.join(combo)})")
            break

    # T-Square: 2 planets in opposition + both square a third
    for opp in opps:
        pa, pb = opp["planet_a"], opp["planet_b"]
        apex_candidates = set()
        for sq in squares:
            pair = {sq["planet_a"], sq["planet_b"]}
            if pa in pair:
                apex = sq["planet_b"] if sq["planet_a"] == pa else sq["planet_a"]
                apex_candidates.add(apex)
        for apex in apex_candidates:
            if any(
                sq["planet_a"] in {pb, apex} and sq["planet_b"] in {pb, apex}
                for sq in squares
            ):
                patterns.append(f"T-Square ({pa}, {pb}, apex {apex})")
                break

    # Grand Cross: 4 planets forming 2 oppositions + 4 squares
    opp_sets = [frozenset([o["planet_a"], o["planet_b"]]) for o in opps]
    for o1, o2 in combinations(opp_sets, 2):
        all_four = o1 | o2
        if len(all_four) == 4:
            sq_count = sum(
                1 for sq in squares
                if sq["planet_a"] in all_four and sq["planet_b"] in all_four
            )
            if sq_count >= 4:
                patterns.append(f"Grand Cross ({', '.join(all_four)})")
                break

    # Yod (Finger of God): 2 planets sextile + both quincunx a third
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
        common_apex = apex_a & apex_b - {pa, pb}
        for apex in common_apex:
            patterns.append(f"Yod ({pa}, {pb}, apex {apex})")
            break

    return patterns


# ─── Geocode ─────────────────────────────────────────────────────────────────
async def geocode(place: str) -> tuple[float, float, str]:
    """Geocode place to lat, lon, and timezone using Supabase cache or Nominatim."""
    try:
        supabase = get_supabase()
        cached = supabase.table("geocode_cache").select("lat,lon,timezone").eq("city_name", place).execute()
        if cached.data:
            return cached.data[0]["lat"], cached.data[0]["lon"], cached.data[0]["timezone"]
    except Exception as e:
        logger.warning(f"Geocode cache read failed: {e}")
        supabase = None

    headers = {'User-Agent': 'AVATAR_v2.1_Backend/1.0'}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://nominatim.openstreetmap.org/search?q={place}&format=json",
            headers=headers
        )
        data = resp.json()
        if not data:
            raise ValueError(f"Could not geocode {place}")
        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])

    tz_str = tf.timezone_at(lat=lat, lng=lon) or "UTC"

    if supabase:
        try:
            supabase.table("geocode_cache").insert({
                "city_name": place, "lat": lat, "lon": lon, "timezone": tz_str
            }).execute()
        except Exception as e:
            logger.warning(f"Geocode cache write failed: {e}")

    return lat, lon, tz_str


async def _calc_planet(jd: float, planet_id: int):
    async with limiter:
        return await anyio.to_thread.run_sync(
            lambda: swe.calc_ut(jd, planet_id)
        )

async def _calc_houses(jd: float, lat: float, lon: float):
    async with limiter:
        return await anyio.to_thread.run_sync(
            lambda: _calc_houses_sync(jd, lat, lon)
        )

def _calc_houses_sync(jd: float, lat: float, lon: float):
    try:
        houses, angles = swe.houses(jd, lat, lon, b"P")
        sys_type = "placidus"
    except Exception:
        houses, angles = swe.houses(jd, lat, lon, b"W")
        sys_type = "whole_sign"
        logger.warning("Placidus failed, falling back to Whole Sign houses")
    return houses, angles, sys_type


async def calculate_chart(birth_date: str, birth_time: str, place: str) -> dict:
    """Main layer 1 function to compute full Astro Chart JSON"""
    lat, lon, tz_str = await geocode(place)

    local_tz = pytz.timezone(tz_str)
    dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
    local_dt = local_tz.localize(dt)
    utc_dt = local_dt.astimezone(pytz.utc)

    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, utc_dt.hour + utc_dt.minute / 60.0)

    houses, angles, house_system = await _calc_houses(jd, lat, lon)

    chart_planets = {}

    for planet_name, planet_id in PLANETS.items():
        res = await _calc_planet(jd, planet_id)
        longitude = res[0][0]
        speed = res[0][3]

        sign_idx = int(longitude // 30)
        sign = ZODIAC_SIGNS[sign_idx]
        deg_in_sign = longitude % 30

        # House placement with wraparound handling
        house_idx = 1
        for i in range(12):
            cusp1 = houses[i]
            cusp2 = houses[(i + 1) % 12]
            if cusp1 <= cusp2:
                if cusp1 <= longitude < cusp2:
                    house_idx = i + 1
                    break
            else:
                if longitude >= cusp1 or longitude < cusp2:
                    house_idx = i + 1
                    break

        chart_planets[planet_name] = {
            "longitude": round(longitude, 2),
            "sign": sign,
            "degree_in_sign": round(deg_in_sign, 2),
            "house": house_idx,
            "retrograde": speed < 0,
            "stationary": abs(speed) < 0.05,
            "speed": round(speed, 4),
            "dignity_score": calc_dignity_score(planet_name, sign),
        }

    # ── Derived calculations ──────────────────────────────────────────────────
    aspects         = calc_aspects(chart_planets)
    stelliums       = calc_stelliums(chart_planets)
    critical_degs   = calc_critical_degrees(chart_planets)
    aspect_patterns = calc_aspect_patterns(aspects)

    return {
        "meta": {
            "house_system": house_system,
            "node_type": "true_node",
            "calculated_at": datetime.utcnow().isoformat()
        },
        "planets": chart_planets,
        "houses": {str(i + 1): {"cusp": round(houses[i], 2)} for i in range(12)},
        "angles": {
            "asc": round(angles[0], 2),
            "mc": round(angles[1], 2)
        },
        "aspects": aspects,
        "aspect_patterns": aspect_patterns,
        "stelliums": stelliums,
        "critical_degrees": critical_degs,
    }
