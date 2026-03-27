from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SUPABASE_URL: str = "http://localhost:8000"
    SUPABASE_KEY: str = "mock-key"
    OPENAI_API_KEY: str = "mock-key"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
