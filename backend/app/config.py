from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str = ""

    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # LLM providers
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_API_KEY: str = ""
    VOICE_MODEL: str = "gpt-4o-mini"

    # Web Push (VAPID)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_SUB: str = "mailto:you@example.com"

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    GRACE_PERIOD_MINUTES: int = 5
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
