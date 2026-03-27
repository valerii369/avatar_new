import asyncio
import os
import swisseph as swe
from app.api.auth import initialize_onboarding_layer, ProfileRequest
import json
from app.core.db import get_supabase

swe.set_ephe_path(os.path.join(os.path.dirname(__file__), "app", "ephe"))

async def main():
    try:
        print("Starting FULL DSB Pipeline Test (Astro -> RAG -> DB)")
        req = ProfileRequest(
            user_id="test_user_777",
            birth_date="1995-05-15",
            birth_time="14:30",
            city_name="Moscow"
        )
        
        await initialize_onboarding_layer(req)
        
        print("\nPipeline finished checking db...")
        supabase = get_supabase()
        resp = supabase.table("user_insights").select("*").eq("user_id", "test_user_777").execute()
        
        print(f"Total Insights saved in DB: {len(resp.data)}")
        if len(resp.data) > 0:
            print("SUCCESS! Data is in Supabase.")
            print(f"Sample Insight: {resp.data[0]['core_theme']} (Sphere {resp.data[0]['primary_sphere']})")
        else:
            print("FAILED: No data in DB.")
            
    except Exception as e:
        print(f"\nFAILED: {e}")

if __name__ == "__main__":
    asyncio.run(main())
