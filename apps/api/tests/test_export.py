"""Integration tests for GET /api/v1/export/concepts and GET /api/v1/export/processes."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "export@example.com"
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


# ── concept export ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_concepts_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.get("/api/v1/export/concepts")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_export_concepts_empty(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    resp = await client.get(
        "/api/v1/export/concepts", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"concepts": []}


@pytest.mark.asyncio
async def test_export_concepts_value_and_formula(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 5000.0},
        headers=headers,
    )
    await client.post(
        "/api/v1/concepts",
        json={"name": "annual", "kind": "formula", "currency_code": "USD", "expression": "salary * 12"},
        headers=headers,
    )

    resp = await client.get("/api/v1/export/concepts", headers=headers)
    assert resp.status_code == 200
    concepts = {c["name"]: c for c in resp.json()["concepts"]}

    assert concepts["salary"]["kind"] == "value"
    assert concepts["salary"]["literal_value"] == 5000.0
    assert concepts["salary"]["group_names"] == []
    assert concepts["salary"]["entity_type_name"] is None

    assert concepts["annual"]["kind"] == "formula"
    assert concepts["annual"]["expression"] == "salary * 12"


@pytest.mark.asyncio
async def test_export_concepts_group_membership(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    grp = await client.post(
        "/api/v1/concepts",
        json={"name": "expenses", "kind": "group", "currency_code": "USD", "aggregate_op": "sum"},
        headers=headers,
    )
    group_id = grp.json()["id"]

    member_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "rent", "kind": "value", "currency_code": "USD", "literal_value": 1000.0},
        headers=headers,
    )
    member = member_resp.json()
    await client.put(
        f"/api/v1/concepts/{member['id']}",
        json={**member, "group_ids": [group_id]},
        headers=headers,
    )

    resp = await client.get("/api/v1/export/concepts", headers=headers)
    concepts = {c["name"]: c for c in resp.json()["concepts"]}

    assert concepts["rent"]["group_names"] == ["expenses"]
    assert concepts["expenses"]["group_names"] == []


@pytest.mark.asyncio
async def test_export_concepts_no_uuid_leakage(client: AsyncClient, seeded_currencies) -> None:
    """Exported items reference group names, not UUIDs."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    grp = await client.post(
        "/api/v1/concepts",
        json={"name": "assets", "kind": "group", "currency_code": "USD", "aggregate_op": "sum"},
        headers=headers,
    )
    group_id = grp.json()["id"]
    member_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "car", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    member = member_resp.json()
    await client.put(
        f"/api/v1/concepts/{member['id']}",
        json={**member, "group_ids": [group_id]},
        headers=headers,
    )

    resp = await client.get("/api/v1/export/concepts", headers=headers)
    car_export = next(c for c in resp.json()["concepts"] if c["name"] == "car")
    assert car_export["group_names"] == ["assets"]
    assert "group_ids" not in car_export


# ── process export ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_processes_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.get("/api/v1/export/processes")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_export_processes_empty(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    resp = await client.get(
        "/api/v1/export/processes", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"processes": []}


@pytest.mark.asyncio
async def test_export_processes_all_scope(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/processes",
        json={"name": "Monthly Review", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )

    resp = await client.get("/api/v1/export/processes", headers=headers)
    assert resp.status_code == 200
    processes = resp.json()["processes"]
    assert len(processes) == 1
    p = processes[0]
    assert p["name"] == "Monthly Review"
    assert p["cadence"] == "monthly"
    assert p["concept_scope"] == "all"
    assert p["selected_concept_names"] == []


@pytest.mark.asyncio
async def test_export_processes_selected_scope(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    c1 = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    c2 = await client.post(
        "/api/v1/concepts",
        json={"name": "rent", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )

    await client.post(
        "/api/v1/processes",
        json={
            "name": "Focused",
            "cadence": "monthly",
            "concept_scope": "selected",
            "selected_concept_ids": [c1.json()["id"], c2.json()["id"]],
        },
        headers=headers,
    )

    resp = await client.get("/api/v1/export/processes", headers=headers)
    p = resp.json()["processes"][0]
    assert p["concept_scope"] == "selected"
    assert sorted(p["selected_concept_names"]) == ["rent", "salary"]
