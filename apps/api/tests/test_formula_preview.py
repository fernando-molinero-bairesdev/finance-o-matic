"""Integration tests for POST /api/v1/formulas/preview."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "formula-preview@example.com"
TEST_PASSWORD = "str0ngPassword!"


@pytest.fixture
async def test_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def session_maker(test_engine) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    maker = async_sessionmaker(test_engine, expire_on_commit=False)

    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_async_session] = _get_test_session
    yield maker
    app.dependency_overrides.clear()


@pytest.fixture
async def client(session_maker) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def seeded_currencies(session_maker) -> None:
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        await session.commit()


async def _register_and_login(client: AsyncClient) -> str:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert reg.status_code == 201
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest.mark.asyncio
async def test_preview_valid_formula(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 5000.0},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "salary * 12"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] == pytest.approx(60000.0)
    assert body["dependencies"] == ["salary"]
    assert body["error"] is None


@pytest.mark.asyncio
async def test_preview_unknown_concept_name(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)

    resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "foo + bar"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] is None
    assert body["error"] is not None
    assert "foo" in body["error"] or "bar" in body["error"]


@pytest.mark.asyncio
async def test_preview_syntax_error(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)

    resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "salary *** 2"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] is None
    assert body["error"] is not None


@pytest.mark.asyncio
async def test_preview_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "1 + 1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_preview_multiple_dependencies(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    for name, value in [("hours", 8.0), ("days", 22.0), ("rate", 50.0)]:
        await client.post(
            "/api/v1/concepts",
            json={"name": name, "kind": "value", "currency_code": "USD", "literal_value": value},
            headers=headers,
        )

    resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "hours * days * rate"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] == pytest.approx(8.0 * 22.0 * 50.0)
    assert sorted(body["dependencies"]) == ["days", "hours", "rate"]
    assert body["error"] is None
