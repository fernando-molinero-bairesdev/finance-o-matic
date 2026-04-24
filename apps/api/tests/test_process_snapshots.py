"""TDD tests for process-linked snapshot taking.

Contract (written before implementation):
  POST /api/v1/processes/{id}/snapshots
  - Takes a snapshot scoped to the process
  - Links snapshot to the process (snapshot.process_id)
  - Respects concept_scope (all vs selected)
  - Updates ProcessSchedule.last_run_at and next_run_at
  - Snapshot.trigger reflects the process cadence
"""

import uuid
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "proc-snap@example.com"
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


async def _create_concept(client, headers, name="rent"):
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": name, "kind": "value", "currency_code": "USD", "literal_value": 1000.0},
        headers=headers,
    )
    return resp.json()["id"]


async def _create_process(client, headers, *, cadence="monthly", scope="all", concept_ids=None):
    payload = {"name": "Test process", "cadence": cadence, "concept_scope": scope}
    if concept_ids:
        payload["selected_concept_ids"] = concept_ids
    resp = await client.post("/api/v1/processes", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── snapshot via process ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_snapshot_returns_201(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers)
    resp = await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_process_snapshot_has_process_id(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers)
    resp = await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    assert resp.json()["process_id"] == pid


@pytest.mark.asyncio
async def test_process_snapshot_scope_all_includes_all_concepts(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    for name in ["rent", "salary"]:
        await _create_concept(client, headers, name)
    pid = await _create_process(client, headers, scope="all")
    resp = await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    assert len(resp.json()["entries"]) == 2


@pytest.mark.asyncio
async def test_process_snapshot_scope_selected_includes_only_selected(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    c1 = await _create_concept(client, headers, "rent")
    await _create_concept(client, headers, "salary")
    pid = await _create_process(client, headers, scope="selected", concept_ids=[c1])
    resp = await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["concept_id"] == c1


@pytest.mark.asyncio
async def test_process_snapshot_updates_schedule_last_run_at(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers, cadence="monthly")
    today = str(date.today())
    await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": today},
        headers=headers,
    )
    proc = await client.get(f"/api/v1/processes/{pid}", headers=headers)
    assert proc.json()["schedule"]["last_run_at"] == today


@pytest.mark.asyncio
async def test_process_snapshot_updates_schedule_next_run_at(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers, cadence="monthly")
    await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    proc = await client.get(f"/api/v1/processes/{pid}", headers=headers)
    # next_run_at should be set and different from last_run_at
    sched = proc.json()["schedule"]
    assert sched["next_run_at"] is not None
    assert sched["next_run_at"] != sched["last_run_at"]


@pytest.mark.asyncio
async def test_process_snapshot_manual_has_no_schedule_change(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers, cadence="manual")
    await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    proc = await client.get(f"/api/v1/processes/{pid}", headers=headers)
    assert proc.json()["schedule"] is None


@pytest.mark.asyncio
async def test_process_snapshot_not_found_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        f"/api/v1/processes/{uuid.uuid4()}/snapshots",
        json={"date": str(date.today())},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_process_snapshot_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        f"/api/v1/processes/{uuid.uuid4()}/snapshots",
        json={"date": str(date.today())},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_snapshot_list_includes_process_id(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    pid = await _create_process(client, headers)
    await client.post(
        f"/api/v1/processes/{pid}/snapshots",
        json={"date": str(date.today())},
        headers=headers,
    )
    resp = await client.get("/api/v1/snapshots", headers=headers)
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["process_id"] == pid
