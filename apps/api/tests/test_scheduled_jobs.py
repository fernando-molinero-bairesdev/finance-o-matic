"""TDD tests for scheduled job functions.

Contract:
  run_due_processes():
  - Creates a snapshot for each active process with next_run_at <= today
  - Uses trigger=scheduled on the snapshot
  - Skips processes with next_run_at > today
  - Skips inactive processes
  - After running, advances last_run_at and next_run_at on the schedule
"""

import uuid
from collections.abc import AsyncGenerator
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency
from app.models.process_schedule import ProcessSchedule
from app.models.snapshot import Snapshot, SnapshotTrigger
from app.services.scheduled_jobs import run_due_processes

TEST_EMAIL = "scheduler@example.com"
TEST_PASSWORD = "str0ngPassword!"


@pytest.fixture
async def test_engine():
    # StaticPool forces all connections to reuse the same underlying connection,
    # which lets multiple async sessions share the same in-memory SQLite DB.
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


@pytest.fixture
async def client(test_maker) -> AsyncGenerator[AsyncClient, None]:
    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_maker() as session:
            yield session

    app.dependency_overrides[get_async_session] = _get_test_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def seeded_currencies(test_maker) -> None:
    async with test_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        await session.commit()


async def _register_and_login(client: AsyncClient) -> tuple[uuid.UUID, str]:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    user_id = uuid.UUID(reg.json()["id"])
    login = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    return user_id, login.json()["access_token"]


async def _create_concept(client: AsyncClient, headers: dict, name: str = "rent") -> str:
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": name, "kind": "value", "currency_code": "USD", "literal_value": 1000.0},
        headers=headers,
    )
    return resp.json()["id"]


async def _create_process(
    client: AsyncClient, headers: dict, *, cadence: str = "monthly"
) -> str:
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "Test process", "cadence": cadence, "concept_scope": "all"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _set_next_run_at(test_maker: async_sessionmaker, process_id: str, d: date) -> None:
    async with test_maker() as session:
        sched = await session.scalar(
            select(ProcessSchedule).where(
                ProcessSchedule.process_id == uuid.UUID(process_id)
            )
        )
        if sched is not None:
            sched.next_run_at = d
            await session.commit()


# ── tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_due_process_gets_a_snapshot(
    client: AsyncClient, test_maker: async_sessionmaker, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    await _create_concept(client, headers)
    pid = await _create_process(client, headers)

    # Force next_run_at to today so the job picks it up
    await _set_next_run_at(test_maker, pid, date.today())

    with patch("app.services.scheduled_jobs.async_session_maker", test_maker):
        await run_due_processes()

    async with test_maker() as session:
        snapshots = (
            await session.scalars(
                select(Snapshot).where(Snapshot.process_id == uuid.UUID(pid))
            )
        ).all()

    assert len(snapshots) == 1
    assert snapshots[0].trigger == SnapshotTrigger.scheduled


@pytest.mark.asyncio
async def test_overdue_process_gets_a_snapshot(
    client: AsyncClient, test_maker: async_sessionmaker, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    await _create_concept(client, headers)
    pid = await _create_process(client, headers)

    # yesterday is overdue
    await _set_next_run_at(test_maker, pid, date.today() - timedelta(days=1))

    with patch("app.services.scheduled_jobs.async_session_maker", test_maker):
        await run_due_processes()

    async with test_maker() as session:
        count = len(
            (
                await session.scalars(
                    select(Snapshot).where(Snapshot.process_id == uuid.UUID(pid))
                )
            ).all()
        )
    assert count == 1


@pytest.mark.asyncio
async def test_future_process_is_skipped(
    client: AsyncClient, test_maker: async_sessionmaker, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers)

    # tomorrow — should NOT be picked up
    await _set_next_run_at(test_maker, pid, date.today() + timedelta(days=1))

    with patch("app.services.scheduled_jobs.async_session_maker", test_maker):
        await run_due_processes()

    async with test_maker() as session:
        count = len(
            (
                await session.scalars(
                    select(Snapshot).where(Snapshot.process_id == uuid.UUID(pid))
                )
            ).all()
        )
    assert count == 0


@pytest.mark.asyncio
async def test_inactive_process_is_skipped(
    client: AsyncClient, test_maker: async_sessionmaker, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers)
    await _set_next_run_at(test_maker, pid, date.today())

    # Deactivate the process
    await client.put(
        f"/api/v1/processes/{pid}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {token}"},
    )

    with patch("app.services.scheduled_jobs.async_session_maker", test_maker):
        await run_due_processes()

    async with test_maker() as session:
        count = len(
            (
                await session.scalars(
                    select(Snapshot).where(Snapshot.process_id == uuid.UUID(pid))
                )
            ).all()
        )
    assert count == 0


@pytest.mark.asyncio
async def test_schedule_advanced_after_run(
    client: AsyncClient, test_maker: async_sessionmaker, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    await _create_concept(client, headers)
    pid = await _create_process(client, headers, cadence="weekly")
    await _set_next_run_at(test_maker, pid, date.today())

    with patch("app.services.scheduled_jobs.async_session_maker", test_maker):
        await run_due_processes()

    async with test_maker() as session:
        sched = await session.scalar(
            select(ProcessSchedule).where(
                ProcessSchedule.process_id == uuid.UUID(pid)
            )
        )

    assert sched is not None
    assert sched.last_run_at == date.today()
    # next_run_at should be 7 days out for a weekly process
    assert sched.next_run_at == date.today() + timedelta(days=7)
