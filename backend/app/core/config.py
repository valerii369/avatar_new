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
    MODEL_LIGHT: str = "gpt-5.4-mini"
    MODEL_HEAVY: str = "gpt-5.4-mini"

    # ── OpenAI models ────────────────────────────────────────────────────────
    # Override any of these in .env to switch models without touching code.
    # Current default: gpt-5.4-mini — 400k context, 128k output, fast & smart.
    #
    # Quick-switch presets (copy the lines into .env):
    #   gpt-5.4-mini           → MODEL_HEAVY=gpt-5.4-mini    MODEL_LIGHT=gpt-5.4-mini
    #   gpt-5.4 (full)         → MODEL_HEAVY=gpt-5.4         MODEL_LIGHT=gpt-5.4-mini
    #   gpt-5.4-nano (cheapest)→ MODEL_HEAVY=gpt-5.4-mini    MODEL_LIGHT=gpt-5.4-nano
    #   gpt-4.1-mini (fallback)→ MODEL_HEAVY=gpt-4.1-mini    MODEL_LIGHT=gpt-4.1-mini
    MODEL_HEAVY: str = "gpt-5.4-mini"   # DSB pipeline, transit synthesis, portraits
    MODEL_LIGHT: str = "gpt-5.4-mini"   # chat assistant, summaries, quick tasks

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
