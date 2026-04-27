"""Integration test: full snapshot lifecycle with starter concepts.

Flow:
  1. Init starter concepts
  2. Open a snapshot → all entries start null
  3. Fill in manual entry values (hourly_rate, hours_per_day, working_days, loan_payment, ...)
  4. Process snapshot → auto entries (monthly_salary, loans) should be computed
     from the filled-in entry values
  5. Complete snapshot → status = complete, locked
  6. Open a second snapshot → copy-behaviour entries pre-filled from first complete snapshot
"""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "workflow@example.com"
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
        await session.commit()


async def _register_and_login(client: AsyncClient) -> str:
    await client.post(
        "/api/v1/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    login = await client.post(
        "/api/v1/auth/jwt/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    return login.json()["access_token"]


async def _init_and_login(client: AsyncClient) -> tuple[str, dict[str, str]]:
    """Register, login, init concepts. Returns (token, name→id map)."""
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/api/v1/init/concepts", headers=headers)
    assert resp.status_code == 201
    concepts = {c["name"]: c["id"] for c in resp.json()["created"]}
    return token, concepts


# ── helpers ───────────────────────────────────────────────────────────────────

def _entries_by_concept(snapshot_detail: dict, concept_ids: dict[str, str]) -> dict[str, dict]:
    """Return {concept_name: entry} from a snapshot detail response."""
    id_to_name = {v: k for k, v in concept_ids.items()}
    result = {}
    for entry in snapshot_detail["entries"]:
        name = id_to_name.get(entry["concept_id"])
        if name:
            result[name] = entry
    return result


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_open_snapshot_has_all_entries_null(client, seeded_currencies) -> None:
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["status"] == "open"
    # All entries start with null value
    for entry in detail["entries"]:
        assert entry["value"] is None, f"Expected null for {entry['concept_id']}, got {entry['value']}"


@pytest.mark.asyncio
async def test_open_snapshot_copies_prior_values(client, seeded_currencies) -> None:
    """Second snapshot pre-fills copy-behaviour entries from the last complete snapshot."""
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create first snapshot and fill + process + complete it
    s1 = (await client.post("/api/v1/snapshots", json={"date": "2026-03-01"}, headers=headers)).json()
    entries = _entries_by_concept(s1, concepts)

    for name, value in [("hourly_rate", 50), ("hours_per_day", 8), ("working_days", 22), ("loan_payment", 100)]:
        entry = entries[name]
        await client.patch(
            f"/api/v1/snapshots/{s1['id']}/entries/{entry['id']}",
            json={"value": value},
            headers=headers,
        )

    await client.post(f"/api/v1/snapshots/{s1['id']}/process", headers=headers)
    await client.post(f"/api/v1/snapshots/{s1['id']}/complete", headers=headers)

    # Open second snapshot — copy-behaviour entries should be pre-filled
    s2 = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    entries2 = _entries_by_concept(s2, concepts)

    assert entries2["hourly_rate"]["value"] == 50
    assert entries2["hours_per_day"]["value"] == 8
    assert entries2["working_days"]["value"] == 22
    assert entries2["loan_payment"]["value"] == 100


@pytest.mark.asyncio
async def test_process_computes_formula_from_entry_values(client, seeded_currencies) -> None:
    """Process should evaluate monthly_salary using snapshot entry values, not concept literal_values."""
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    entries = _entries_by_concept(snap, concepts)

    # Fill in manual entries: hourly_rate=50, hours_per_day=8, working_days=22
    for name, value in [("hourly_rate", 50), ("hours_per_day", 8), ("working_days", 22)]:
        await client.patch(
            f"/api/v1/snapshots/{snap['id']}/entries/{entries[name]['id']}",
            json={"value": value},
            headers=headers,
        )

    processed = (await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)).json()
    assert processed["status"] == "processed"

    entries_after = _entries_by_concept(processed, concepts)
    # monthly_salary = hourly_rate * hours_per_day * working_days = 50 * 8 * 22 = 8800
    assert entries_after["monthly_salary"]["value"] == pytest.approx(8800.0), (
        f"Expected 8800 but got {entries_after['monthly_salary']['value']}"
    )


@pytest.mark.asyncio
async def test_process_computes_group_from_entry_values(client, seeded_currencies) -> None:
    """loans group should sum loan_payment using the snapshot entry value."""
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    entries = _entries_by_concept(snap, concepts)

    await client.patch(
        f"/api/v1/snapshots/{snap['id']}/entries/{entries['loan_payment']['id']}",
        json={"value": 500},
        headers=headers,
    )

    processed = (await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)).json()
    entries_after = _entries_by_concept(processed, concepts)

    assert entries_after["loans"]["value"] == pytest.approx(500.0), (
        f"Expected 500 but got {entries_after['loans']['value']}"
    )


@pytest.mark.asyncio
async def test_complete_transitions_to_locked(client, seeded_currencies) -> None:
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)
    completed = (await client.post(f"/api/v1/snapshots/{snap['id']}/complete", headers=headers)).json()

    assert completed["status"] == "complete"


@pytest.mark.asyncio
async def test_cannot_edit_entry_on_complete_snapshot(client, seeded_currencies) -> None:
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    entries = _entries_by_concept(snap, concepts)
    await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)
    await client.post(f"/api/v1/snapshots/{snap['id']}/complete", headers=headers)

    resp = await client.patch(
        f"/api/v1/snapshots/{snap['id']}/entries/{entries['hourly_rate']['id']}",
        json={"value": 999},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_can_reprocess_already_processed_snapshot(client, seeded_currencies) -> None:
    """Re-processing a processed snapshot is allowed and recomputes auto values."""
    token, concepts = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    entries = _entries_by_concept(snap, concepts)

    # First pass: hourly_rate=50, working_days=22
    for name, value in [("hourly_rate", 50), ("hours_per_day", 8), ("working_days", 22)]:
        await client.patch(
            f"/api/v1/snapshots/{snap['id']}/entries/{entries[name]['id']}",
            json={"value": value},
            headers=headers,
        )
    first = (await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)).json()
    assert _entries_by_concept(first, concepts)["monthly_salary"]["value"] == pytest.approx(8800.0)

    # Update hourly_rate entry to 100 and re-process
    await client.patch(
        f"/api/v1/snapshots/{snap['id']}/entries/{entries['hourly_rate']['id']}",
        json={"value": 100},
        headers=headers,
    )
    second = (await client.post(f"/api/v1/snapshots/{snap['id']}/process", headers=headers)).json()
    assert second["status"] == "processed"
    assert _entries_by_concept(second, concepts)["monthly_salary"]["value"] == pytest.approx(17600.0)


@pytest.mark.asyncio
async def test_cannot_complete_open_snapshot(client, seeded_currencies) -> None:
    token, _ = await _init_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    snap = (await client.post("/api/v1/snapshots", json={"date": "2026-04-01"}, headers=headers)).json()
    resp = await client.post(f"/api/v1/snapshots/{snap['id']}/complete", headers=headers)
    assert resp.status_code == 409
