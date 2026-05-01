"""Tests for snapshot-scoped FX rate capture and reproducibility.

When process_snapshot is called:
  - The current global FX rates are saved to snapshot_fx_rates for that snapshot.
  - On re-process, the already-saved snapshot FX rates are reused (not the global ones).
  - The snapshot detail response includes the fx_rates array.
"""

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency
from app.models.fx_rate import FxRate
from app.models.snapshot_fx_rate import SnapshotFxRate

TEST_EMAIL = "fxtest@example.com"
TEST_PASSWORD = "str0ngPassword!"


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
        session.add(Currency(code="EUR", name="Euro"))
        await session.commit()


async def _register_and_login(client: AsyncClient) -> str:
    await client.post(
        "/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    return login.json()["access_token"]


async def _seed_fx_rate(session_maker: async_sessionmaker, quote_code: str, rate: float) -> None:
    async with session_maker() as session:
        existing = await session.execute(
            select(FxRate).where(FxRate.base_code == "USD", FxRate.quote_code == quote_code)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.rate = rate
            row.as_of = date(2026, 4, 30)
        else:
            session.add(FxRate(
                base_code="USD",
                quote_code=quote_code,
                rate=rate,
                as_of=date(2026, 4, 30),
            ))
        await session.commit()


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fx_rates_saved_on_first_process(client, session_maker, seeded_currencies) -> None:
    """Processing a snapshot saves the current global FX rates to snapshot_fx_rates."""
    await _seed_fx_rate(session_maker, "EUR", 0.92)

    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a simple value concept and snapshot
    await client.post(
        "/api/v1/concepts",
        json={"name": "savings", "kind": "value", "currency_code": "USD", "literal_value": 1000},
        headers=headers,
    )
    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-30"}, headers=headers)).json()
    snap_id = snap["id"]

    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    # SnapshotFxRate rows should exist for this snapshot
    async with session_maker() as session:
        from uuid import UUID
        result = await session.execute(
            select(SnapshotFxRate).where(SnapshotFxRate.snapshot_id == UUID(snap_id))
        )
        rows = result.scalars().all()

    assert len(rows) >= 1
    eur_row = next((r for r in rows if r.quote_code == "EUR"), None)
    assert eur_row is not None
    assert eur_row.rate == pytest.approx(0.92)
    assert eur_row.base_code == "USD"


@pytest.mark.asyncio
async def test_fx_rates_reused_on_reprocess(client, session_maker, seeded_currencies) -> None:
    """Re-processing a snapshot uses the saved FX rates, not updated global ones."""
    await _seed_fx_rate(session_maker, "EUR", 0.92)

    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/concepts",
        json={"name": "savings", "kind": "value", "currency_code": "USD", "literal_value": 1000},
        headers=headers,
    )
    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-30"}, headers=headers)).json()
    snap_id = snap["id"]

    # First process — captures 0.92
    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    # Update the global FX rate to a different value
    await _seed_fx_rate(session_maker, "EUR", 1.50)

    # Re-process — should reuse saved rate, not the updated global one
    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    async with session_maker() as session:
        from uuid import UUID
        result = await session.execute(
            select(SnapshotFxRate).where(
                SnapshotFxRate.snapshot_id == UUID(snap_id),
                SnapshotFxRate.quote_code == "EUR",
            )
        )
        rows = result.scalars().all()

    # Should still be 0.92, not 1.50
    assert len(rows) == 1
    assert rows[0].rate == pytest.approx(0.92)


@pytest.mark.asyncio
async def test_fx_rates_included_in_detail_response(client, session_maker, seeded_currencies) -> None:
    """GET /snapshots/{id} returns fx_rates array after processing."""
    await _seed_fx_rate(session_maker, "EUR", 0.92)

    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/concepts",
        json={"name": "savings", "kind": "value", "currency_code": "USD", "literal_value": 1000},
        headers=headers,
    )
    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-30"}, headers=headers)).json()
    snap_id = snap["id"]

    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()

    assert "fx_rates" in detail
    assert len(detail["fx_rates"]) >= 1
    eur = next((r for r in detail["fx_rates"] if r["quote_code"] == "EUR"), None)
    assert eur is not None
    assert eur["base_code"] == "USD"
    assert eur["rate"] == pytest.approx(0.92)
    assert eur["as_of"] == "2026-04-30"
