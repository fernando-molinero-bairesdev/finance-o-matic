"""TDD tests for POST /api/v1/init/entity-types."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "et_init@example.com"
TEST_PASSWORD = "str0ngPassword!"

EXPECTED_TYPES = {"Asset", "Account", "Loan", "Investment"}


# ── fixtures ──────────────────────────────────────────────────────────────────

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
    await client.post("/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    return login.json()["access_token"]


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_init_entity_types_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.post("/api/v1/init/entity-types")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_init_entity_types_returns_201_on_first_call(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    resp = await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_init_entity_types_creates_all_four(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    resp = await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert set(body["created"]) == EXPECTED_TYPES
    assert body["skipped"] == []


@pytest.mark.asyncio
async def test_init_asset_has_correct_properties(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})

    types_resp = await client.get("/api/v1/entity-types", headers={"Authorization": f"Bearer {token}"})
    asset = next(t for t in types_resp.json()["items"] if t["name"] == "Asset")
    prop_names = {p["name"] for p in asset["properties"]}
    assert prop_names == {"description", "acquisition_date", "purchase_price"}


@pytest.mark.asyncio
async def test_init_loan_collateral_refs_asset(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})

    types_resp = await client.get("/api/v1/entity-types", headers={"Authorization": f"Bearer {token}"})
    items = types_resp.json()["items"]
    asset = next(t for t in items if t["name"] == "Asset")
    loan = next(t for t in items if t["name"] == "Loan")

    collateral = next(p for p in loan["properties"] if p["name"] == "collateral")
    assert collateral["value_type"] == "entity_ref"
    assert collateral["ref_entity_type_id"] == asset["id"]


@pytest.mark.asyncio
async def test_init_investment_broker_refs_account(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})

    types_resp = await client.get("/api/v1/entity-types", headers={"Authorization": f"Bearer {token}"})
    items = types_resp.json()["items"]
    account = next(t for t in items if t["name"] == "Account")
    investment = next(t for t in items if t["name"] == "Investment")

    broker = next(p for p in investment["properties"] if p["name"] == "broker")
    assert broker["value_type"] == "entity_ref"
    assert broker["ref_entity_type_id"] == account["id"]


@pytest.mark.asyncio
async def test_init_loan_apr_is_required(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    await client.post("/api/v1/init/entity-types", headers={"Authorization": f"Bearer {token}"})

    types_resp = await client.get("/api/v1/entity-types", headers={"Authorization": f"Bearer {token}"})
    loan = next(t for t in types_resp.json()["items"] if t["name"] == "Loan")
    apr = next(p for p in loan["properties"] if p["name"] == "apr")
    assert apr["nullable"] is False


@pytest.mark.asyncio
async def test_init_entity_types_is_idempotent(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/init/entity-types", headers=headers)
    resp = await client.post("/api/v1/init/entity-types", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == []
    assert set(body["skipped"]) == EXPECTED_TYPES
