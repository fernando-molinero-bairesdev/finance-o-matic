from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.auth.users import auth_backend, fastapi_users
from app.core.config import settings
from app.core.db import Base, engine
from app.schemas.user import UserCreate, UserRead, UserUpdate

# Ensure models are imported so their tables register in Base.metadata
from app.models import user as _user_model  # noqa: F401
from app.models import currency as _currency_model  # noqa: F401
from app.models import fx_rate as _fx_rate_model  # noqa: F401
from app.models import concept as _concept_model  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="finance-o-matic API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth routes ---
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/v1/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/v1/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/api/v1/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/v1/users",
    tags=["users"],
)

# --- Feature routes ---
app.include_router(v1_router)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
