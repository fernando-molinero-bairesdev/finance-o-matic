"""TDD tests for the FX rate fetch job.

Contract:
  fetch_fx_rates():
  - Calls frankfurter.app with the configured base currency
  - Upserts rate rows into the fx_rates table (one per quote currency)
  - Re-running for the same date updates rates instead of duplicating them
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base
from app.models.fx_rate import FxRate
from app.services.scheduled_jobs import fetch_fx_rates

TODAY = str(date.today())
MOCK_FX_RESPONSE = {
    "date": TODAY,
    "base": "USD",
    "rates": {"EUR": 0.92, "GBP": 0.79},
}


@pytest.fixture
async def test_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def test_maker(test_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(test_engine, expire_on_commit=False)


def _mock_httpx(response_data: dict):
    """Return a context-manager mock that makes httpx.AsyncClient.get return response_data."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = response_data

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    mock_cls = MagicMock()
    mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_cls


# ── tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_creates_fx_rate_rows(test_maker: async_sessionmaker) -> None:
    mock_cls = _mock_httpx(MOCK_FX_RESPONSE)
    with (
        patch("app.services.scheduled_jobs.httpx.AsyncClient", mock_cls),
        patch("app.services.scheduled_jobs.async_session_maker", test_maker),
    ):
        await fetch_fx_rates()

    async with test_maker() as session:
        rates = (await session.scalars(select(FxRate))).all()

    assert len(rates) == 2
    quote_codes = {r.quote_code for r in rates}
    assert quote_codes == {"EUR", "GBP"}


@pytest.mark.asyncio
async def test_fetch_stores_correct_rate_values(test_maker: async_sessionmaker) -> None:
    mock_cls = _mock_httpx(MOCK_FX_RESPONSE)
    with (
        patch("app.services.scheduled_jobs.httpx.AsyncClient", mock_cls),
        patch("app.services.scheduled_jobs.async_session_maker", test_maker),
    ):
        await fetch_fx_rates()

    async with test_maker() as session:
        eur = await session.scalar(
            select(FxRate).where(FxRate.base_code == "USD", FxRate.quote_code == "EUR")
        )
    assert eur is not None
    assert abs(eur.rate - 0.92) < 1e-6


@pytest.mark.asyncio
async def test_fetch_upserts_on_duplicate_date(test_maker: async_sessionmaker) -> None:
    first_call = _mock_httpx({**MOCK_FX_RESPONSE, "rates": {"EUR": 0.90, "GBP": 0.78}})
    second_call = _mock_httpx({**MOCK_FX_RESPONSE, "rates": {"EUR": 0.95, "GBP": 0.80}})

    with (
        patch("app.services.scheduled_jobs.async_session_maker", test_maker),
        patch("app.services.scheduled_jobs.httpx.AsyncClient", first_call),
    ):
        await fetch_fx_rates()

    with (
        patch("app.services.scheduled_jobs.async_session_maker", test_maker),
        patch("app.services.scheduled_jobs.httpx.AsyncClient", second_call),
    ):
        await fetch_fx_rates()

    async with test_maker() as session:
        rates = (await session.scalars(select(FxRate))).all()
        eur = await session.scalar(
            select(FxRate).where(FxRate.base_code == "USD", FxRate.quote_code == "EUR")
        )

    # Still only 2 rows — no duplicates
    assert len(rates) == 2
    # Rate updated to the second call's value
    assert eur is not None
    assert abs(eur.rate - 0.95) < 1e-6


@pytest.mark.asyncio
async def test_fetch_handles_http_error_gracefully(test_maker: async_sessionmaker) -> None:
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
    mock_cls = MagicMock()
    mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("app.services.scheduled_jobs.httpx.AsyncClient", mock_cls),
        patch("app.services.scheduled_jobs.async_session_maker", test_maker),
    ):
        # Should not raise — errors are caught internally
        await fetch_fx_rates()

    async with test_maker() as session:
        count = len((await session.scalars(select(FxRate))).all())
    assert count == 0
