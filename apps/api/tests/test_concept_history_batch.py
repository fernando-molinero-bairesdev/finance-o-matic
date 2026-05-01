"""Tests for GET /api/v1/concepts/history/batch?ids=...

Returns a dict keyed by concept ID string, where each value is a list of
ConceptHistoryPoint from complete snapshots, sorted by date asc.
Unknown or other-user concept IDs are silently omitted (no 404).
"""

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "batchhist@example.com"
TEST_PASSWORD = "str0ngPassword!"
OTHER_EMAIL = "other@example.com"
OTHER_PASSWORD = "str0ngPassword!"


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


async def _register_and_login(client: AsyncClient, email: str = TEST_EMAIL, password: str = TEST_PASSWORD) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": email, "password": password}
    )
    return login.json()["access_token"]


async def _create_concept(client: AsyncClient, headers: dict, name: str, value: float) -> str:
    resp = await client.post(
        "/api/v1/concepts",
        json={
            "name": name,
            "kind": "value",
            "currency_code": "USD",
            "literal_value": value,
            "carry_behaviour": "auto",
        },
        headers=headers,
    )
    return resp.json()["id"]


async def _complete_snapshot(client: AsyncClient, headers: dict, snap_date: str) -> dict:
    snap = (await client.post("/api/v1/snapshots", json={"date": snap_date}, headers=headers)).json()
    await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)
    return (await client.post(f"/api/v1/snapshots/{snap['id']}/complete", headers=headers)).json()


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_returns_empty_for_empty_ids(client, seeded_currencies) -> None:
    """No ids param → returns empty dict."""
    token = await _register_and_login(client)
    resp = await client.get(
        "/api/v1/concepts/history/batch",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {}


@pytest.mark.asyncio
async def test_batch_returns_history_for_each_concept(client, seeded_currencies) -> None:
    """Returns history for each requested concept ID, keyed by concept ID string."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    savings_id = await _create_concept(client, headers, "savings", 1000.0)
    income_id = await _create_concept(client, headers, "income", 5000.0)

    # Complete two snapshots
    await _complete_snapshot(client, headers, "2026-01-01")
    await _complete_snapshot(client, headers, "2026-02-01")

    resp = await client.get(
        f"/api/v1/concepts/history/batch?ids={savings_id},{income_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert savings_id in data
    assert income_id in data
    assert len(data[savings_id]) == 2
    assert len(data[income_id]) == 2

    # Sorted by date ascending
    dates = [p["date"] for p in data[savings_id]]
    assert dates == sorted(dates)
    assert data[savings_id][0]["value"] == pytest.approx(1000.0)
    assert data[savings_id][0]["currency_code"] == "USD"


@pytest.mark.asyncio
async def test_batch_omits_unknown_concept_ids(client, seeded_currencies) -> None:
    """Unknown concept IDs are silently omitted, not a 404."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    savings_id = await _create_concept(client, headers, "savings", 1000.0)
    await _complete_snapshot(client, headers, "2026-01-01")

    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(
        f"/api/v1/concepts/history/batch?ids={savings_id},{fake_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert savings_id in data
    assert fake_id not in data


@pytest.mark.asyncio
async def test_batch_omits_other_user_concepts(client, seeded_currencies) -> None:
    """Concept IDs belonging to another user are silently omitted."""
    # User A creates a concept
    token_a = await _register_and_login(client, OTHER_EMAIL, OTHER_PASSWORD)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    other_concept_id = await _create_concept(client, headers_a, "savings", 1000.0)
    await _complete_snapshot(client, headers_a, "2026-01-01")

    # User B requests that concept ID
    token_b = await _register_and_login(client)
    resp = await client.get(
        f"/api/v1/concepts/history/batch?ids={other_concept_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {}


@pytest.mark.asyncio
async def test_batch_excludes_non_complete_snapshots(client, seeded_currencies) -> None:
    """Only complete snapshot entries appear in batch history."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    savings_id = await _create_concept(client, headers, "savings", 1000.0)

    # Complete one snapshot
    await _complete_snapshot(client, headers, "2026-01-01")
    # Open another snapshot but don't complete it
    await client.post("/api/v1/snapshots", json={"date": "2026-02-01"}, headers=headers)

    resp = await client.get(
        f"/api/v1/concepts/history/batch?ids={savings_id}",
        headers=headers,
    )
    data = resp.json()
    assert len(data[savings_id]) == 1
    assert data[savings_id][0]["date"] == "2026-01-01"


@pytest.mark.asyncio
async def test_batch_requires_auth(client, seeded_currencies) -> None:
    resp = await client.get("/api/v1/concepts/history/batch?ids=00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 401
