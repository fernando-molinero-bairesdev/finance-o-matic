"""Auth smoke tests: register → login → protected access."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app

TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "str0ngPassword!"


@pytest.fixture
async def test_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def override_session(test_engine) -> AsyncGenerator[None, None]:
    test_session_maker = async_sessionmaker(test_engine, expire_on_commit=False)

    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_async_session] = _get_test_session
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def client(override_session) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_register_new_user(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == TEST_EMAIL
    assert "id" in data
    assert "hashed_password" not in data


async def test_login_returns_token(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    resp = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_protected_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/concepts")
    assert resp.status_code == 401


async def test_protected_endpoint_accessible_with_token(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    login_resp = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/concepts",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_me_endpoint_returns_current_user(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    login_resp = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == TEST_EMAIL
