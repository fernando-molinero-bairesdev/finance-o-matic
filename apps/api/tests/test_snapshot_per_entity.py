"""Tests for per-entity concept entries in snapshots.

Contracts:
  - A concept with entity_type_id creates one ConceptEntry per entity of that type
  - Each entry has entity_id set to the matching entity
  - Carry correctly matches entity_id from a prior complete snapshot
  - A concept with entity_type_id but no entities of that type falls back to one entry (entity_id=None)
  - A concept without entity_type_id creates a single entry as before
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

TEST_EMAIL = "per-entity@example.com"
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


async def _init_entity_types(client, headers):
    resp = await client.post("/api/v1/init/entity-types", headers=headers)
    assert resp.status_code in (200, 201)
    return resp.json()


async def _get_account_type_id(client, headers) -> str:
    resp = await client.get("/api/v1/entity-types", headers=headers)
    assert resp.status_code == 200
    for et in resp.json()["items"]:
        if et["name"] == "Account":
            return et["id"]
    raise AssertionError("Account entity type not found")


async def _create_entity(client, headers, entity_type_id: str, name: str) -> str:
    resp = await client.post(
        "/api/v1/entities",
        json={"entity_type_id": entity_type_id, "name": name},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_concept(client, headers, name: str, entity_type_id: str | None = None):
    body = {"name": name, "kind": "value", "currency_code": "USD"}
    if entity_type_id:
        body["entity_type_id"] = entity_type_id
    resp = await client.post("/api/v1/concepts", json=body, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def _take_snapshot(client, headers, snapshot_date: str = "2024-01-01"):
    resp = await client.post(
        "/api/v1/snapshots",
        json={"date": snapshot_date},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.asyncio
async def test_per_entity_concept_creates_one_entry_per_entity(client, seeded_currencies):
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await _init_entity_types(client, headers)
    account_type_id = await _get_account_type_id(client, headers)

    # Create two Account entities
    await _create_entity(client, headers, account_type_id, "Checking")
    await _create_entity(client, headers, account_type_id, "Savings")

    # Create a concept bound to Account entity type
    await _create_concept(client, headers, "balance", entity_type_id=account_type_id)

    snapshot = await _take_snapshot(client, headers)

    # Fetch snapshot detail
    detail = await client.get(f"/api/v1/snapshots/{snapshot['id']}", headers=headers)
    assert detail.status_code == 200
    entries = detail.json()["entries"]

    # Should have 2 entries for "balance", one per Account entity
    balance_entries = [e for e in entries if e["concept_id"] == snapshot["id"] or True]
    assert len(entries) == 2
    entity_ids = {e["entity_id"] for e in entries}
    assert None not in entity_ids
    assert len(entity_ids) == 2


@pytest.mark.asyncio
async def test_per_entity_fallback_when_no_entities(client, seeded_currencies):
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await _init_entity_types(client, headers)
    account_type_id = await _get_account_type_id(client, headers)

    # No Account entities created
    await _create_concept(client, headers, "balance", entity_type_id=account_type_id)

    snapshot = await _take_snapshot(client, headers)
    detail = await client.get(f"/api/v1/snapshots/{snapshot['id']}", headers=headers)
    entries = detail.json()["entries"]

    # Falls back to single entry with entity_id=None
    assert len(entries) == 1
    assert entries[0]["entity_id"] is None


@pytest.mark.asyncio
async def test_non_per_entity_concept_creates_single_entry(client, seeded_currencies):
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await _init_entity_types(client, headers)
    account_type_id = await _get_account_type_id(client, headers)

    # Create entities but concept is NOT per-entity
    await _create_entity(client, headers, account_type_id, "Checking")
    await _create_entity(client, headers, account_type_id, "Savings")
    await _create_concept(client, headers, "salary")  # no entity_type_id

    snapshot = await _take_snapshot(client, headers)
    detail = await client.get(f"/api/v1/snapshots/{snapshot['id']}", headers=headers)
    entries = detail.json()["entries"]

    assert len(entries) == 1
    assert entries[0]["entity_id"] is None


@pytest.mark.asyncio
async def test_per_entity_carry_is_entity_scoped(client, seeded_currencies):
    """Prior entry for each entity is carried forward independently."""
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    await _init_entity_types(client, headers)
    account_type_id = await _get_account_type_id(client, headers)

    checking_id = await _create_entity(client, headers, account_type_id, "Checking")
    savings_id = await _create_entity(client, headers, account_type_id, "Savings")
    await _create_concept(client, headers, "balance", entity_type_id=account_type_id)

    # First snapshot
    snap1 = await _take_snapshot(client, headers, "2024-01-01")
    detail1 = await client.get(f"/api/v1/snapshots/{snap1['id']}", headers=headers)
    entries1 = detail1.json()["entries"]

    # Fill in values for each entity
    for entry in entries1:
        val = 1000.0 if entry["entity_id"] == checking_id else 5000.0
        patch = await client.patch(
            f"/api/v1/snapshots/{snap1['id']}/entries/{entry['id']}",
            json={"value": val},
            headers=headers,
        )
        assert patch.status_code == 200

    # Process then complete the first snapshot
    proc = await client.post(f"/api/v1/snapshots/{snap1['id']}/process", headers=headers)
    assert proc.status_code == 200
    comp = await client.post(f"/api/v1/snapshots/{snap1['id']}/complete", headers=headers)
    assert comp.status_code == 200

    # Second snapshot — values should be carried per entity
    snap2 = await _take_snapshot(client, headers, "2024-02-01")
    detail2 = await client.get(f"/api/v1/snapshots/{snap2['id']}", headers=headers)
    entries2 = detail2.json()["entries"]

    assert len(entries2) == 2
    by_entity = {e["entity_id"]: e["value"] for e in entries2}
    assert by_entity[checking_id] == 1000.0
    assert by_entity[savings_id] == 5000.0


@pytest.mark.asyncio
async def test_init_entities_endpoint(client, seeded_currencies):
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Without entity types, should get 409
    resp = await client.post("/api/v1/init/entities", headers=headers)
    assert resp.status_code == 409

    # After seeding types, should work
    await _init_entity_types(client, headers)
    resp = await client.post("/api/v1/init/entities", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["created"]) == 5
    assert data["skipped"] == []

    # Idempotent: second call skips all
    resp2 = await client.post("/api/v1/init/entities", headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["created"] == []
    assert len(data2["skipped"]) == 5
