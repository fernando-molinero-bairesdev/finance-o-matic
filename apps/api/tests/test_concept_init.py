"""TDD tests for the concept initialization endpoint.

Defines the contract BEFORE implementation:
  POST /api/v1/init/concepts
  - Creates a fixed set of starter concepts for the authenticated user
  - Idempotent: re-calling skips already-existing names
  - Returns { created: [...], skipped: [...] }
"""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "init@example.com"
TEST_PASSWORD = "str0ngPassword!"

EXPECTED_NAMES = {
    "rent",
    "loans",
    "loan_payment",
    "investments",
    "hourly_rate",
    "hours_per_day",
    "working_days",
    "monthly_salary",
}


# ── fixtures (same pattern as test_concepts_crud.py) ──────────────────────────

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
    await client.post(
        "/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    return login.json()["access_token"]


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_init_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.post("/api/v1/init/concepts")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_init_returns_201_on_first_call(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_init_creates_all_expected_concepts(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    created_names = {c["name"] for c in body["created"]}
    assert created_names == EXPECTED_NAMES
    assert body["skipped"] == []


@pytest.mark.asyncio
async def test_init_monthly_salary_is_formula(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    salary = next(c for c in resp.json()["created"] if c["name"] == "monthly_salary")
    assert salary["kind"] == "formula"
    assert salary["carry_behaviour"] == "auto"
    assert "hourly_rate" in salary["expression"]
    assert "hours_per_day" in salary["expression"]
    assert "working_days" in salary["expression"]


@pytest.mark.asyncio
async def test_init_loans_is_group_with_sum(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    loans = next(c for c in resp.json()["created"] if c["name"] == "loans")
    assert loans["kind"] == "group"
    assert loans["aggregate_op"] == "sum"


@pytest.mark.asyncio
async def test_init_loan_payment_is_child_of_loans(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    created = resp.json()["created"]
    loans = next(c for c in created if c["name"] == "loans")
    payment = next(c for c in created if c["name"] == "loan_payment")
    assert payment["parent_group_id"] == loans["id"]


@pytest.mark.asyncio
async def test_init_hours_per_day_defaults_to_eight(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    hpd = next(c for c in resp.json()["created"] if c["name"] == "hours_per_day")
    assert hpd["literal_value"] == 8.0
    assert hpd["carry_behaviour"] == "copy"


@pytest.mark.asyncio
async def test_init_hourly_rate_has_copy_carry_behaviour(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/init/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    rate = next(c for c in resp.json()["created"] if c["name"] == "hourly_rate")
    assert rate["carry_behaviour"] == "copy"


@pytest.mark.asyncio
async def test_init_is_idempotent_second_call_skips_all(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/init/concepts", headers=headers)
    resp = await client.post("/api/v1/init/concepts", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == []
    assert set(body["skipped"]) == EXPECTED_NAMES


@pytest.mark.asyncio
async def test_init_partial_idempotency_skips_existing_creates_missing(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    # Pre-create rent manually
    await client.post(
        "/api/v1/concepts",
        json={"name": "rent", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    resp = await client.post("/api/v1/init/concepts", headers=headers)
    body = resp.json()
    created_names = {c["name"] for c in body["created"]}
    assert "rent" not in created_names
    assert "rent" in body["skipped"]
    assert created_names == EXPECTED_NAMES - {"rent"}


@pytest.mark.asyncio
async def test_init_monthly_salary_evaluates_correctly(
    client: AsyncClient, seeded_currencies
) -> None:
    """hourly_rate=50, hours_per_day=8 (default), working_days=22 → 8800."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    init_resp = await client.post("/api/v1/init/concepts", headers=headers)
    created = init_resp.json()["created"]

    hourly_rate_id = next(c["id"] for c in created if c["name"] == "hourly_rate")
    working_days_id = next(c["id"] for c in created if c["name"] == "working_days")
    monthly_salary_id = next(c["id"] for c in created if c["name"] == "monthly_salary")

    await client.put(
        f"/api/v1/concepts/{hourly_rate_id}",
        json={"literal_value": 50.0},
        headers=headers,
    )
    await client.put(
        f"/api/v1/concepts/{working_days_id}",
        json={"literal_value": 22.0},
        headers=headers,
    )

    eval_resp = await client.post(
        f"/api/v1/concepts/{monthly_salary_id}/evaluate", headers=headers
    )
    assert eval_resp.status_code == 200
    assert eval_resp.json()["value"] == pytest.approx(8800.0)
