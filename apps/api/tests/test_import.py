"""Integration tests for POST /api/v1/import/concepts and POST /api/v1/import/processes."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "import@example.com"
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


# ── concept import ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_import_concepts_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": []},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_import_concepts_creates_new(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/concepts",
        json={
            "concepts": [
                {"name": "salary", "kind": "value", "currency_code": "USD", "carry_behaviour": "copy_or_manual", "literal_value": 5000.0},
                {"name": "annual", "kind": "formula", "currency_code": "USD", "expression": "salary * 12"},
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["created"]) == ["annual", "salary"]
    assert body["updated"] == []
    assert body["errors"] == []

    # Verify they actually exist
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    names = {c["name"] for c in list_resp.json()["items"]}
    assert {"salary", "annual"} <= names


@pytest.mark.asyncio
async def test_import_concepts_updates_existing(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create first
    await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 3000.0},
        headers=headers,
    )

    # Import with updated value
    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": [
            {"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 6000.0}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == []
    assert body["updated"] == ["salary"]
    assert body["errors"] == []

    # Verify value was updated
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    salary = next(c for c in list_resp.json()["items"] if c["name"] == "salary")
    assert salary["literal_value"] == 6000.0


@pytest.mark.asyncio
async def test_import_concepts_idempotent(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {"concepts": [
        {"name": "rent", "kind": "value", "currency_code": "USD", "literal_value": 1500.0}
    ]}

    r1 = await client.post("/api/v1/import/concepts", json=payload, headers=headers)
    assert r1.json()["created"] == ["rent"]

    r2 = await client.post("/api/v1/import/concepts", json=payload, headers=headers)
    assert r2.json()["updated"] == ["rent"]
    assert r2.json()["created"] == []


@pytest.mark.asyncio
async def test_import_concepts_with_group_membership(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": [
            {"name": "expenses", "kind": "group", "currency_code": "USD", "aggregate_op": "sum"},
            {"name": "rent", "kind": "value", "currency_code": "USD", "literal_value": 1000.0, "group_names": ["expenses"]},
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["errors"] == []

    # Verify membership
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    concepts = {c["name"]: c for c in list_resp.json()["items"]}
    expenses_id = concepts["expenses"]["id"]
    assert expenses_id in concepts["rent"]["group_ids"]


@pytest.mark.asyncio
async def test_import_concepts_unknown_group_error(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": [
            {"name": "rent", "kind": "value", "currency_code": "USD", "group_names": ["nonexistent_group"]}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert any("nonexistent_group" in e for e in body["errors"])


@pytest.mark.asyncio
async def test_import_concepts_unknown_entity_type_error(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": [
            {"name": "balance", "kind": "value", "currency_code": "USD", "entity_type_name": "GhostType"}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert any("GhostType" in e for e in body["errors"])
    # The concept should NOT have been created
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    names = {c["name"] for c in list_resp.json()["items"]}
    assert "balance" not in names


@pytest.mark.asyncio
async def test_import_concepts_partial_errors_dont_block_others(
    client: AsyncClient, seeded_currencies
) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/concepts",
        json={"concepts": [
            {"name": "good", "kind": "value", "currency_code": "USD", "literal_value": 100.0},
            {"name": "bad", "kind": "value", "currency_code": "USD", "entity_type_name": "MissingType"},
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "good" in body["created"]
    assert body["errors"]  # bad concept errored


# ── process import ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_import_processes_requires_auth(client: AsyncClient, seeded_currencies) -> None:
    resp = await client.post("/api/v1/import/processes", json={"processes": []})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_import_processes_creates_new(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/processes",
        json={"processes": [
            {"name": "Monthly Review", "cadence": "monthly", "concept_scope": "all"}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == ["Monthly Review"]
    assert body["errors"] == []

    list_resp = await client.get("/api/v1/processes", headers=headers)
    names = [p["name"] for p in list_resp.json()["items"]]
    assert "Monthly Review" in names


@pytest.mark.asyncio
async def test_import_processes_updates_existing(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/processes",
        json={"name": "Review", "cadence": "monthly", "concept_scope": "all"},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/import/processes",
        json={"processes": [
            {"name": "Review", "cadence": "quarterly", "concept_scope": "all"}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["updated"] == ["Review"]
    assert body["created"] == []

    list_resp = await client.get("/api/v1/processes", headers=headers)
    p = next(p for p in list_resp.json()["items"] if p["name"] == "Review")
    assert p["cadence"] == "quarterly"


@pytest.mark.asyncio
async def test_import_processes_with_selected_concepts(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/import/processes",
        json={"processes": [
            {"name": "Focused", "cadence": "monthly", "concept_scope": "selected", "selected_concept_names": ["salary"]}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["errors"] == []

    list_resp = await client.get("/api/v1/processes", headers=headers)
    p = next(p for p in list_resp.json()["items"] if p["name"] == "Focused")
    assert len(p["selected_concept_ids"]) == 1


@pytest.mark.asyncio
async def test_import_processes_unknown_concept_error(client: AsyncClient, seeded_currencies) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/import/processes",
        json={"processes": [
            {"name": "Bad", "cadence": "monthly", "concept_scope": "selected", "selected_concept_names": ["ghost"]}
        ]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert any("ghost" in e for e in body["errors"])
    assert "Bad" not in body["created"]


# ── roundtrip ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_roundtrip_concepts(client: AsyncClient, seeded_currencies) -> None:
    """Export concepts then import them into a fresh account — same structure."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Set up: group + member concept
    grp = await client.post(
        "/api/v1/concepts",
        json={"name": "costs", "kind": "group", "currency_code": "USD", "aggregate_op": "sum"},
        headers=headers,
    )
    group_id = grp.json()["id"]
    member_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "rent", "kind": "value", "currency_code": "USD", "literal_value": 1200.0},
        headers=headers,
    )
    member = member_resp.json()
    await client.put(
        f"/api/v1/concepts/{member['id']}",
        json={**member, "group_ids": [group_id]},
        headers=headers,
    )

    # Export
    export_resp = await client.get("/api/v1/export/concepts", headers=headers)
    exported = export_resp.json()

    # Import into same account (idempotent)
    import_resp = await client.post("/api/v1/import/concepts", json=exported, headers=headers)
    assert import_resp.json()["errors"] == []

    # Verify membership is intact
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    concepts = {c["name"]: c for c in list_resp.json()["items"]}
    assert concepts["costs"]["id"] in concepts["rent"]["group_ids"]
