"""Integration tests for the GET /currencies endpoint."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency


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


@pytest.mark.asyncio
async def test_list_currencies_empty_when_none_seeded(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/currencies")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_list_currencies_returns_seeded_currencies(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        session.add(Currency(code="EUR", name="Euro"))
        await session.commit()

    resp = await client.get("/api/v1/currencies")
    assert resp.status_code == 200
    codes = {item["code"] for item in resp.json()["items"]}
    assert codes == {"USD", "EUR"}


@pytest.mark.asyncio
async def test_list_currencies_ordered_by_code(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    async with session_maker() as session:
        session.add(Currency(code="ZZZ", name="Zzz"))
        session.add(Currency(code="AAA", name="Aaa"))
        await session.commit()

    resp = await client.get("/api/v1/currencies")
    codes = [item["code"] for item in resp.json()["items"]]
    assert codes == sorted(codes)


@pytest.mark.asyncio
async def test_list_currencies_does_not_require_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/currencies")
    assert resp.status_code == 200
