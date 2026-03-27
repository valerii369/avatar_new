from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def get_supabase() -> Client:
    try:
        supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return supabase
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        # Return a mock or raise depending on strictness
        raise e
