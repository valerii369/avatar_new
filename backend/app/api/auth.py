from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.dsb.natal_chart import calculate_chart
from app.services.dsb.western_astrology_agent import generate_insights
from app.services.dsb.synthesis import synthesize, save_to_supabase, generate_portrait_summary
from app.core.db import get_supabase
import logging
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()

class ProfileRequest(BaseModel):
    user_id: str
    birth_date: str
    birth_time: str
    birth_place: str
    gender: Optional[str] = "male"

class GeocodeRequest(BaseModel):
    place: str

@router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """
    Simplified geocoding using OpenStreetMap Nominatim.
    In production, you'd use a more robust provider or cache result in Supabase.
    """
    supabase = get_supabase()
    
    # Check cache first
    cached = supabase.table("geocode_cache").select("*").eq("city_name", request.place).execute()
    if cached.data:
        return cached.data[0]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": request.place, "format": "json", "limit": 1},
                headers={"User-Agent": "AVATAR-App/1.0"}
            )
            data = resp.json()
            if not data:
                raise HTTPException(status_code=404, detail="Location not found")
            
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            
            # Simple timezone lookup could be added here
            # For now, we return lat/lon
            result = {"city_name": request.place, "lat": lat, "lon": lon, "timezone": "UTC"}
            
            # Save to cache
            supabase.table("geocode_cache").insert(result).execute()
            
            return result
    except Exception as e:
        logger.error(f"Geocoding failed: {e}")
        raise HTTPException(status_code=500, detail="Geocoding service error")

async def initialize_onboarding_layer(req: ProfileRequest):
    """
    Background task that runs the fully 3-Layer DSB Pipeline.
    """
    logger.info(f"Starting DSB Pipeline for user: {req.user_id}")
    try:
        # Layer 1: Astro
        astro_chart = await calculate_chart(req.birth_date, req.birth_time, req.birth_place)
        
        # Layer 2: RAG
        uis_response = await generate_insights(astro_chart)
        
        # Layer 3: Synthesis
        synthesized_data = synthesize(uis_response.insights)
        
        # Layer 4: Portrait
        portrait = await generate_portrait_summary(req.user_id, synthesized_data)

        # Save to DB
        await save_to_supabase(req.user_id, synthesized_data, portrait)
        logger.info(f"Successfully completed DSB Pipeline for user: {req.user_id}")
    except Exception as e:
        logger.error(f"DSB Pipeline failed for user {req.user_id}: {e}")

@router.post("/calculate")
async def calculate_profile(request: ProfileRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(initialize_onboarding_layer, request)
        return {"status": "processing", "message": "DSB Pipeline initialized"}
    except Exception as e:
        logger.error(str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")

@router.get("/profile")
async def get_profile(user_id: str):
    supabase = get_supabase()
    res = supabase.table("user_portraits").select("user_id").eq("user_id", user_id).execute()
    
    # In a real app, we'd check more than just the portrait
    onboarding_done = len(res.data) > 0
    
    return {
        "user_id": user_id,
        "onboarding_done": onboarding_done,
        "birth_date": "1990-01-15", # Placeholder
        "xp": 500,
        "xp_current": 0,
        "xp_next": 1000,
        "evolution_level": 5,
        "title": "Новичок",
        "energy": 100
    }

@router.post("/login")
async def login(request: dict):
    # Mock login for now, matching the frontend expectation
    return {
        "user_id": request.get("test_user_id", "test_user_123"),
        "tg_id": 1234567,
        "first_name": "Valerii",
        "token": "mock_token",
        "energy": 100,
        "streak": 1,
        "evolution_level": 5,
        "title": "Новичок",
        "onboarding_done": True,
        "xp": 500,
        "xp_current": 0,
        "xp_next": 1000,
        "referral_code": "AVATAR_REF",
        "photo_url": ""
    }
