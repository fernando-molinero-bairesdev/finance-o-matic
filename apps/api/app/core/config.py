import logging
import warnings

from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT = "CHANGEME-replace-in-production-secret"

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    secret_key: str = _INSECURE_DEFAULT
    jwt_lifetime_seconds: int = 3600
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()

if settings.secret_key == _INSECURE_DEFAULT:
    warnings.warn(
        "SECRET_KEY is set to the insecure default value. "
        "Set the SECRET_KEY environment variable before deploying to production.",
        stacklevel=1,
    )
