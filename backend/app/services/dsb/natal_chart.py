import os
import anyio
import swisseph as swe
from timezonefinder import TimezoneFinder
import pytz
from datetime import datetime, date, time
from app.core.db import get_supabase
import httpx
import logging

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

    # Fallback to Nominatim 
    # Because we don't have a self-hosted one right now, we use the public one with careful headers
    # Note: For production AVATAR v2.1, this should be pointing to self-hosted Nominatim.
    headers = {'User-Agent': 'AVATAR_v2.1_Backend/1.0'}
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://nominatim.openstreetmap.org/search?q={place}&format=json", headers=headers)
        data = resp.json()
        if not data:
            raise ValueError(f"Could not geocode {place}")
        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])
    
    tz_str = tf.timezone_at(lat=lat, lng=lon) or "UTC"
    
    # Save to cache if connected
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
    return houses, angles, sys_type

async def calculate_chart(birth_date: str, birth_time: str, place: str) -> dict:
    """Main layer 1 function to compute full Astro Chart JSON"""
    lat, lon, tz_str = await geocode(place)
    
    # Time logic
    local_tz = pytz.timezone(tz_str)
    dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
    local_dt = local_tz.localize(dt)
    utc_dt = local_dt.astimezone(pytz.utc)
    
    # Julian Day
    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, utc_dt.hour + utc_dt.minute/60.0)
    
    houses, angles, house_system = await _calc_houses(jd, lat, lon)
    
    chart_planets = {}
    
    for planet_name, planet_id in PLANETS.items():
        res = await _calc_planet(jd, planet_id)
        longitude = res[0][0]
        speed = res[0][3]
        
        sign_idx = int(longitude // 30)
        sign = ZODIAC_SIGNS[sign_idx]
        deg_in_sign = longitude % 30
        
        # Determine house placement roughly 
        # (needs fine tuning for exact cusps but we do basic bounding here)
        house_idx = 1
        for i in range(12):
            cusp1 = houses[i]
            cusp2 = houses[(i+1)%12]
            
            # handle wrap-around at 360
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
            "speed": round(speed, 2),
            "dignity_score": 0, # Would require a dignity lookup table
        }
        
    return {
        "meta": {
            "house_system": house_system,
            "node_type": "true_node",
            "calculated_at": datetime.utcnow().isoformat()
        },
        "planets": chart_planets,
        "houses": {str(i+1): {"cusp": round(houses[i], 2)} for i in range(12)},
        "angles": {
            "asc": round(angles[0], 2),
            "mc": round(angles[1], 2)
        },
        "aspect_patterns": [],
        "aspects": [] 
    }
