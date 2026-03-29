from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SUPABASE_URL: str = "https://localhost"
    SUPABASE_KEY: str = "mock-key"
    OPENAI_API_KEY: str = "mock-key"
    DATABASE_URL: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    MINI_APP_URL: str = ""

    # OpenAI models
    MODEL_HEAVY: str = "gpt-4o"             # complex: DSB Layer 2 (RAG + insights)
    MODEL_LIGHT: str = "gpt-4o-mini"       # simple: chat, portrait, summaries

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
