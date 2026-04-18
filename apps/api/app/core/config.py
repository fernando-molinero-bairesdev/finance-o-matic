from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    secret_key: str = "CHANGEME-replace-in-production-secret"
    jwt_lifetime_seconds: int = 3600


settings = Settings()
