from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.dsb.natal_chart import calculate_chart
from app.services.dsb.western_astrology_agent import generate_insights
from app.services.dsb.synthesis import synthesize, save_to_supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class ProfileRequest(BaseModel):
    user_id: str
    birth_date: str
    birth_time: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    timezone: Optional[str] = None
    city_name: str

async def initialize_onboarding_layer(req: ProfileRequest):
    """
    Background task that runs the fully 3-Layer DSB Pipeline.
    Layer 1: Calculate Astro Chart (Rich JSON)
    Layer 2: RAG Agent (GPT-4o) generates UISResponse (60-100 items)
    Layer 3: Synthesize into 12 spheres & save to DB
    """
    logger.info(f"Starting DSB Pipeline for user: {req.user_id}")
    try:
        # Layer 1
        astro_chart = await calculate_chart(req.birth_date, req.birth_time, req.city_name)
        
        # Layer 2
        uis_response = await generate_insights(astro_chart)
        
        # Layer 3
        synthesized_data = synthesize(uis_response.insights)
        
        # Save to DB
        await save_to_supabase(req.user_id, synthesized_data)
        logger.info(f"Successfully completed DSB Pipeline for user: {req.user_id}")
    except Exception as e:
        logger.error(f"DSB Pipeline failed for user {req.user_id}: {e}")

@router.post("/profile")
async def create_profile(request: ProfileRequest, background_tasks: BackgroundTasks):
    try:
        # We queue the long-running DSB generation pipeline in the background.
        # This matches the AVATAR_ARCHITECTURE_v2.1 diagram where the frontend
        # requests the profile creation and polls for the result later.
        background_tasks.add_task(initialize_onboarding_layer, request)
        return {"status": "processing", "message": "DSB Pipeline initialized"}
    except Exception as e:
        logger.error(str(e))
        raise HTTPException(status_code=500, detail="Internal Server Error")
