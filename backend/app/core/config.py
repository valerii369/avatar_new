from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

class Settings(BaseSettings):
    SUPABASE_URL: str = "https://localhost"
    SUPABASE_KEY: str = "mock-key"
    OPENAI_API_KEY: str = "mock-key"
    DATABASE_URL: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    MINI_APP_URL: str = ""

    # ── OpenAI models ────────────────────────────────────────────────────────
    # Override any of these in .env to switch models without touching code.
    # Current default: gpt-4.1-mini — fast, smart, cost-effective.
    #
    # Quick-switch presets (copy the line into .env):
    #   gpt-4.1-mini   → MODEL_HEAVY=gpt-4.1-mini   MODEL_LIGHT=gpt-4.1-mini
    #   gpt-4.1        → MODEL_HEAVY=gpt-4.1         MODEL_LIGHT=gpt-4.1-mini
    #   gpt-4o         → MODEL_HEAVY=gpt-4o          MODEL_LIGHT=gpt-4o-mini
    #   o4-mini        → MODEL_HEAVY=o4-mini         MODEL_LIGHT=o4-mini
    MODEL_HEAVY: str = "gpt-4.1-mini"   # DSB pipeline, transit synthesis, portraits
    MODEL_LIGHT: str = "gpt-4.1-mini"   # chat assistant, summaries, quick tasks

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
