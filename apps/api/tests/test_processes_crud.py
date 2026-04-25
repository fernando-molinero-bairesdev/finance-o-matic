"""TDD tests for Process CRUD endpoints.

Contract (written before implementation):
  POST   /api/v1/processes
  GET    /api/v1/processes
  GET    /api/v1/processes/{id}
  PUT    /api/v1/processes/{id}
  DELETE /api/v1/processes/{id}
"""

import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "processes@example.com"
TEST_EMAIL_B = "processes-b@example.com"
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


async def _register_and_login(
    client: AsyncClient, email: str = TEST_EMAIL
) -> tuple[uuid.UUID, str]:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": TEST_PASSWORD}
    )
    user_id = uuid.UUID(reg.json()["id"])
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": email, "password": TEST_PASSWORD}
    )
    return user_id, login.json()["access_token"]


# ── CREATE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_process_returns_201(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "Monthly snapshot", "cadence": "monthly", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Monthly snapshot"
    assert body["cadence"] == "monthly"
    assert body["concept_scope"] == "all"
    assert body["is_active"] is True
    assert "id" in body


@pytest.mark.asyncio
async def test_create_process_manual_cadence(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "Ad-hoc", "cadence": "manual", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["cadence"] == "manual"


@pytest.mark.asyncio
async def test_create_process_with_schedule_when_non_manual(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "Weekly", "cadence": "weekly", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["schedule"] is not None
    assert body["schedule"]["next_run_at"] is not None
    assert body["schedule"]["last_run_at"] is None


@pytest.mark.asyncio
async def test_create_process_manual_has_no_schedule(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "Ad-hoc", "cadence": "manual", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["schedule"] is None


@pytest.mark.asyncio
async def test_create_process_selected_scope_with_concept_ids(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    c = await client.post(
        "/api/v1/concepts",
        json={"name": "rent", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    concept_id = c.json()["id"]
    resp = await client.post(
        "/api/v1/processes",
        json={
            "name": "Rent only",
            "cadence": "monthly",
            "concept_scope": "selected",
            "selected_concept_ids": [concept_id],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["concept_scope"] == "selected"
    assert concept_id in body["selected_concept_ids"]


@pytest.mark.asyncio
async def test_create_process_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/processes",
        json={"name": "x", "cadence": "manual", "concept_scope": "all"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_duplicate_process_name_returns_409(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"name": "Monthly", "cadence": "monthly", "concept_scope": "all"}
    await client.post("/api/v1/processes", json=payload, headers=headers)
    resp = await client.post("/api/v1/processes", json=payload, headers=headers)
    assert resp.status_code == 409


# ── LIST ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_processes_empty_for_new_user(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.get(
        "/api/v1/processes", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_list_processes_returns_user_processes(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    for name in ["A", "B"]:
        await client.post(
            "/api/v1/processes",
            json={"name": name, "cadence": "manual", "concept_scope": "all"},
            headers=headers,
        )
    resp = await client.get("/api/v1/processes", headers=headers)
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_list_does_not_leak_other_user_processes(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)
    await client.post(
        "/api/v1/processes",
        json={"name": "A", "cadence": "manual", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    resp = await client.get(
        "/api/v1/processes", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.json()["items"] == []


# ── GET ────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_process_returns_200(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "Monthly", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    resp = await client.get(f"/api/v1/processes/{pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Monthly"


@pytest.mark.asyncio
async def test_get_process_not_found_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.get(
        f"/api/v1/processes/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_process_other_user_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)
    create = await client.post(
        "/api/v1/processes",
        json={"name": "Monthly", "cadence": "monthly", "concept_scope": "all"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    pid = create.json()["id"]
    resp = await client.get(
        f"/api/v1/processes/{pid}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 404


# ── UPDATE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_process_name(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "Old name", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    resp = await client.put(
        f"/api/v1/processes/{pid}", json={"name": "New name"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New name"


@pytest.mark.asyncio
async def test_update_process_is_active(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "P", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    resp = await client.put(
        f"/api/v1/processes/{pid}", json={"is_active": False}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_update_process_not_found_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.put(
        f"/api/v1/processes/{uuid.uuid4()}",
        json={"name": "x"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── DELETE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_process_returns_204(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "Monthly", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    resp = await client.delete(f"/api/v1/processes/{pid}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_removes_from_list(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "Monthly", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    await client.delete(f"/api/v1/processes/{pid}", headers=headers)
    resp = await client.get("/api/v1/processes", headers=headers)
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_delete_process_not_found_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.delete(
        f"/api/v1/processes/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ── LIFECYCLE SYNC ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_cadence_recalculates_next_run_at(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "P", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]
    original_next = create.json()["schedule"]["next_run_at"]

    # Change cadence to weekly — next_run_at should be recalculated from today
    resp = await client.put(
        f"/api/v1/processes/{pid}", json={"cadence": "weekly"}, headers=headers
    )
    assert resp.status_code == 200
    new_next = resp.json()["schedule"]["next_run_at"]
    assert new_next != original_next
    assert resp.json()["cadence"] == "weekly"


@pytest.mark.asyncio
async def test_reactivate_process_recalculates_next_run_at(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create = await client.post(
        "/api/v1/processes",
        json={"name": "P2", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )
    pid = create.json()["id"]

    # Deactivate
    await client.put(f"/api/v1/processes/{pid}", json={"is_active": False}, headers=headers)

    # Reactivate — next_run_at should be freshly set from today
    resp = await client.put(
        f"/api/v1/processes/{pid}", json={"is_active": True}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
    assert resp.json()["schedule"]["next_run_at"] is not None
