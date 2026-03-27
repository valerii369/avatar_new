import os
import anyio
import swisseph as swe
from timezonefinder import TimezoneFinder
import pytz
from datetime import datetime
from app.core.db import get_supabase
import httpx
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

limiter = anyio.CapacityLimiter(20)
tf = TimezoneFinder()

# ─── Planets ───────────────────────────────────────────────────────────────────
PLANETS = {
    "sun": swe.SUN, "moon": swe.MOON, "mercury": swe.MERCURY, "venus": swe.VENUS,
    "mars": swe.MARS, "jupiter": swe.JUPITER, "saturn": swe.SATURN,
    "uranus": swe.URANUS, "neptune": swe.NEPTUNE, "pluto": swe.PLUTO,
    "north_node": swe.TRUE_NODE, "chiron": swe.CHIRON, "lilith": swe.MEAN_APOG
}

PERSONAL_PLANETS = {"sun", "moon", "mercury", "venus", "mars"}

ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

ELEMENTS = {
    "fire": ["Aries", "Leo", "Sagittarius"],
    "earth": ["Taurus", "Virgo", "Capricorn"],
    "air":   ["Gemini", "Libra", "Aquarius"],
    "water": ["Cancer", "Scorpio", "Pisces"]
}

MODALITIES = {
    "cardinal": ["Aries", "Cancer", "Libra", "Capricorn"],
    "fixed":    ["Taurus", "Leo", "Scorpio", "Aquarius"],
    "mutable":  ["Gemini", "Virgo", "Sagittarius", "Pisces"]
}

# ─── Dignity ───────────────────────────────────────────────────────────────────
DIGNITY_TABLE = {
    "sun":     {"domicile": ["Leo"],                    "exaltation": ["Aries"],       "detriment": ["Aquarius"],              "fall": ["Libra"]},
    "moon":    {"domicile": ["Cancer"],                 "exaltation": ["Taurus"],      "detriment": ["Capricorn"],             "fall": ["Scorpio"]},
    "mercury": {"domicile": ["Gemini", "Virgo"],        "exaltation": ["Virgo"],       "detriment": ["Sagittarius", "Pisces"], "fall": ["Pisces"]},
    "venus":   {"domicile": ["Taurus", "Libra"],        "exaltation": ["Pisces"],      "detriment": ["Aries", "Scorpio"],      "fall": ["Virgo"]},
    "mars":    {"domicile": ["Aries", "Scorpio"],       "exaltation": ["Capricorn"],   "detriment": ["Libra", "Taurus"],       "fall": ["Cancer"]},
    "jupiter": {"domicile": ["Sagittarius", "Pisces"],  "exaltation": ["Cancer"],      "detriment": ["Gemini", "Virgo"],       "fall": ["Capricorn"]},
    "saturn":  {"domicile": ["Capricorn", "Aquarius"],  "exaltation": ["Libra"],       "detriment": ["Cancer", "Leo"],         "fall": ["Aries"]},
    "uranus":  {"domicile": ["Aquarius"],               "exaltation": ["Scorpio"],     "detriment": ["Leo"],                   "fall": ["Taurus"]},
    "neptune": {"domicile": ["Pisces"],                 "exaltation": ["Cancer"],      "detriment": ["Virgo"],                 "fall": ["Capricorn"]},
    "pluto":   {"domicile": ["Scorpio"],                "exaltation": ["Aries"],       "detriment": ["Taurus"],                "fall": ["Libra"]},
}

def get_dignity_score(planet_name: str, sign: str) -> int:
    d = DIGNITY_TABLE.get(planet_name)
    if not d:
        return 0
    if sign in d.get("domicile", []):
        return 5
    if sign in d.get("exaltation", []):
        return 4
    if sign in d.get("fall", []):
        return -4
    if sign in d.get("detriment", []):
        return -5
    return 0

# ─── Aspects ───────────────────────────────────────────────────────────────────
ASPECT_DEFINITIONS = [
    {"name": "conjunction",    "angle": 0,   "orb": 8.0},
    {"name": "sextile",        "angle": 60,  "orb": 6.0},
    {"name": "square",         "angle": 90,  "orb": 8.0},
    {"name": "trine",          "angle": 120, "orb": 8.0},
    {"name": "opposition",     "angle": 180, "orb": 8.0},
    {"name": "quincunx",       "angle": 150, "orb": 3.0},
    {"name": "semisquare",     "angle": 45,  "orb": 2.0},
    {"name": "sesquiquadrate", "angle": 135, "orb": 2.0},
]

def angular_distance(lon1: float, lon2: float) -> float:
    diff = abs(lon1 - lon2) % 360
    return min(diff, 360 - diff)

def calculate_aspects(planets: dict) -> list[dict]:
    aspects = []
    names = list(planets.keys())

    for i, p1 in enumerate(names):
        for p2 in names[i + 1:]:
            lon1 = planets[p1]["longitude"]
            lon2 = planets[p2]["longitude"]
            dist = angular_distance(lon1, lon2)

            for asp in ASPECT_DEFINITIONS:
                orb = abs(dist - asp["angle"])
                if orb <= asp["orb"]:
                    base_weight = round(1.0 - orb / asp["orb"], 2)
                    # Boost for personal planets
                    if p1 in PERSONAL_PLANETS or p2 in PERSONAL_PLANETS:
                        base_weight = min(1.0, round(base_weight + 0.15, 2))
                    aspects.append({
                        "planet_a": p1,
                        "planet_b": p2,
                        "type": asp["name"],
                        "orb": round(orb, 2),
                        "exact": orb < 1.0,
                        "influence_weight": base_weight,
                    })
                    break  # each pair → at most one aspect

    aspects.sort(key=lambda x: x["influence_weight"], reverse=True)
    return aspects

# ─── Aspect Patterns ───────────────────────────────────────────────────────────
def detect_aspect_patterns(aspects: list[dict]) -> list[str]:
    asp_map: dict[tuple, str] = {}
    for a in aspects:
        asp_map[(a["planet_a"], a["planet_b"])] = a["type"]
        asp_map[(a["planet_b"], a["planet_a"])] = a["type"]

    def has(p1, p2, t):
        return asp_map.get((p1, p2)) == t

    planets = list({p for a in aspects for p in (a["planet_a"], a["planet_b"])})
    patterns = []

    # T-Square
    for i, p1 in enumerate(planets):
        for j, p2 in enumerate(planets):
            if i >= j:
                continue
            if has(p1, p2, "opposition"):
                for p3 in planets:
                    if p3 in (p1, p2) and has(p1, p3, "square") and has(p2, p3, "square"):
                        patterns.append(f"T-Square: {p1}/{p2} apex {p3}")

    # Grand Trine
    for i, p1 in enumerate(planets):
        for j, p2 in enumerate(planets):
            if i >= j:
                continue
            for k, p3 in enumerate(planets):
                if j >= k:
                    continue
                if has(p1, p2, "trine") and has(p2, p3, "trine") and has(p1, p3, "trine"):
                    patterns.append(f"Grand Trine: {p1}/{p2}/{p3}")

    # Grand Cross
    for i, p1 in enumerate(planets):
        for j, p2 in enumerate(planets):
            if i >= j or not has(p1, p2, "opposition"):
                continue
            for k, p3 in enumerate(planets):
                if k in (i, j):
                    continue
                for l, p4 in enumerate(planets):
                    if l <= k or l in (i, j):
                        continue
                    if (has(p3, p4, "opposition") and
                            has(p1, p3, "square") and has(p1, p4, "square") and
                            has(p2, p3, "square") and has(p2, p4, "square")):
                        patterns.append(f"Grand Cross: {p1}/{p2}/{p3}/{p4}")

    # Yod (Finger of God)
    for i, p1 in enumerate(planets):
        for j, p2 in enumerate(planets):
            if i >= j or not has(p1, p2, "sextile"):
                continue
            for p3 in planets:
                if p3 in (p1, p2) and has(p1, p3, "quincunx") and has(p2, p3, "quincunx"):
                    patterns.append(f"Yod: {p1}/{p2} pointing to {p3}")

    return patterns

# ─── Stelliums ─────────────────────────────────────────────────────────────────
def detect_stelliums(planets: dict) -> list[dict]:
    sign_groups: dict[str, list] = defaultdict(list)
    house_groups: dict[int, list] = defaultdict(list)

    for name, data in planets.items():
        sign_groups[data["sign"]].append(name)
        house_groups[data["house"]].append(name)

    result = []
    for sign, members in sign_groups.items():
        if len(members) >= 3:
            result.append({"type": "sign", "sign": sign, "planets": members})
    for house, members in house_groups.items():
        if len(members) >= 3:
            result.append({"type": "house", "house": house, "planets": members})
    return result

# ─── Critical Degrees ──────────────────────────────────────────────────────────
# Traditional astrological critical degrees by modality
CRITICAL_DEGREES_MAP = {
    "cardinal": [0, 13, 26],
    "fixed":    [8, 9, 21, 22],
    "mutable":  [4, 17],
}
ANARETIC_DEGREE = 29.0

def detect_critical_degrees(planets: dict) -> list[str]:
    critical = []
    for name, data in planets.items():
        deg = data["degree_in_sign"]
        sign = data["sign"]

        # Anaretic (29°)
        if abs(deg - ANARETIC_DEGREE) < 1.0:
            critical.append(name)
            continue

        # Modality-based critical degrees
        for modality, signs in MODALITIES.items():
            if sign in signs:
                for c in CRITICAL_DEGREES_MAP.get(modality, []):
                    if abs(deg - c) < 1.0:
                        critical.append(name)
                        break
                break
    return critical

# ─── Geocoding ─────────────────────────────────────────────────────────────────
async def geocode(place: str) -> tuple[float, float, str]:
    try:
        supabase = get_supabase()
        cached = supabase.table("geocode_cache").select("lat,lon,timezone").eq("city_name", place).execute()
        if cached.data:
            return cached.data[0]["lat"], cached.data[0]["lon"], cached.data[0]["timezone"]
    except Exception as e:
        logger.warning(f"Geocode cache read failed: {e}")
        supabase = None

    headers = {"User-Agent": "AVATAR_v2.1_Backend/1.0"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": place, "format": "json", "limit": 1},
            headers=headers
        )
        data = resp.json()
        if not data:
            raise ValueError(f"Could not geocode '{place}'")
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

# ─── Swiss Ephemeris helpers ───────────────────────────────────────────────────
async def _calc_planet(jd: float, planet_id: int):
    async with limiter:
        return await anyio.to_thread.run_sync(lambda: swe.calc_ut(jd, planet_id))

async def _calc_houses(jd: float, lat: float, lon: float):
    async with limiter:
        return await anyio.to_thread.run_sync(lambda: _calc_houses_sync(jd, lat, lon))

def _calc_houses_sync(jd: float, lat: float, lon: float):
    try:
        houses, angles = swe.houses(jd, lat, lon, b"P")
        sys_type = "placidus"
    except Exception:
        houses, angles = swe.houses(jd, lat, lon, b"W")
        sys_type = "whole_sign"
    return houses, angles, sys_type

def _get_house(longitude: float, houses: tuple) -> int:
    for i in range(12):
        cusp1 = houses[i]
        cusp2 = houses[(i + 1) % 12]
        if cusp1 <= cusp2:
            if cusp1 <= longitude < cusp2:
                return i + 1
        else:
            if longitude >= cusp1 or longitude < cusp2:
                return i + 1
    return 1

# ─── Main calculate_chart ──────────────────────────────────────────────────────
async def calculate_chart(birth_date: str, birth_time: str, place: str) -> dict:
    """Layer 1: compute full natal chart JSON with all features."""
    lat, lon, tz_str = await geocode(place)

    local_tz = pytz.timezone(tz_str)
    dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
    utc_dt = local_tz.localize(dt).astimezone(pytz.utc)

    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day,
                    utc_dt.hour + utc_dt.minute / 60.0)

    houses, angles, house_system = await _calc_houses(jd, lat, lon)

    chart_planets: dict[str, dict] = {}
    for planet_name, planet_id in PLANETS.items():
        res = await _calc_planet(jd, planet_id)
        longitude = res[0][0]
        speed = res[0][3]

        sign_idx = int(longitude // 30)
        sign = ZODIAC_SIGNS[sign_idx]
        deg_in_sign = longitude % 30
        house_idx = _get_house(longitude, houses)
        dignity = get_dignity_score(planet_name, sign)

        chart_planets[planet_name] = {
            "longitude":      round(longitude, 4),
            "sign":           sign,
            "degree_in_sign": round(deg_in_sign, 2),
            "house":          house_idx,
            "retrograde":     speed < 0,
            "stationary":     abs(speed) < 0.05,
            "speed":          round(speed, 4),
            "dignity_score":  dignity,
        }

    aspects = calculate_aspects(chart_planets)
    stelliums = detect_stelliums(chart_planets)
    aspect_patterns = detect_aspect_patterns(aspects)
    critical_degrees = detect_critical_degrees(chart_planets)

    # Element and modality balance
    element_counts: dict[str, int] = defaultdict(int)
    modality_counts: dict[str, int] = defaultdict(int)
    for p in chart_planets.values():
        for el, signs in ELEMENTS.items():
            if p["sign"] in signs:
                element_counts[el] += 1
        for mod, signs in MODALITIES.items():
            if p["sign"] in signs:
                modality_counts[mod] += 1

    return {
        "meta": {
            "house_system":   house_system,
            "node_type":      "true_node",
            "calculated_at":  datetime.utcnow().isoformat(),
            "birth_place":    place,
            "lat":            round(lat, 4),
            "lon":            round(lon, 4),
            "timezone":       tz_str,
        },
        "planets":          chart_planets,
        "houses":           {str(i + 1): {"cusp": round(houses[i], 2)} for i in range(12)},
        "angles":           {"asc": round(angles[0], 2), "mc": round(angles[1], 2)},
        "aspects":          aspects,
        "aspect_patterns":  aspect_patterns,
        "stelliums":        stelliums,
        "critical_degrees": critical_degrees,
        "balance": {
            "elements":    dict(element_counts),
            "modalities":  dict(modality_counts),
        },
    }
