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

    # OpenAI models
    MODEL_HEAVY: str = "gpt-4o"              # complex: per-sphere insight agents
    MODEL_LIGHT: str = "gpt-4o-mini"       # simple: chat, portrait, summaries

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
