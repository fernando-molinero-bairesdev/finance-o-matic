"""Tests for historical aggregate formula functions: hist_sum, hist_min, hist_max, hist_count."""
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency
from app.services.formula.engine import (
    extract_reference_names,
    parse_formula,
)
from app.services.formula.historical import extract_hist_specs, HistoricalCallSpec


# ── Fixtures ───────────────────────────────────────────────────────────────��─

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


# ── Unit tests: parse / extract ───────────────────────────────────────────────

class TestHistExtract:
    def test_hist_sum_not_in_reference_names(self) -> None:
        """hist_* calls should not produce concept reference names."""
        refs = extract_reference_names("balance + hist_sum('savings', 3, 'month')")
        assert refs == {"balance"}
        assert "savings" not in refs

    def test_extract_hist_specs_basic(self) -> None:
        specs = extract_hist_specs("hist_sum('savings', 3, 'month')")
        assert len(specs) == 1
        spec = specs[0]
        assert spec.func_name == "hist_sum"
        assert spec.concept_name == "savings"
        assert spec.period == 3
        assert spec.unit == "month"
        assert spec.process_names == ()

    def test_extract_hist_specs_with_processes(self) -> None:
        specs = extract_hist_specs("hist_sum('savings', 6, 'month', 'monthly', 'quarterly')")
        assert len(specs) == 1
        spec = specs[0]
        assert spec.process_names == ("monthly", "quarterly")

    def test_extract_hist_specs_multiple_calls(self) -> None:
        specs = extract_hist_specs(
            "hist_sum('income', 12, 'month') - hist_min('expenses', 3, 'month')"
        )
        assert len(specs) == 2
        func_names = {s.func_name for s in specs}
        assert func_names == {"hist_sum", "hist_min"}

    def test_extract_hist_specs_no_hist_calls(self) -> None:
        specs = extract_hist_specs("a + b * 2")
        assert specs == []

    def test_hist_func_year_unit(self) -> None:
        specs = extract_hist_specs("hist_max('revenue', 2, 'year')")
        assert specs[0].unit == "year"

    def test_hist_func_count(self) -> None:
        specs = extract_hist_specs("hist_count('net_worth', 5, 'month')")
        assert specs[0].func_name == "hist_count"

    def test_parse_formula_accepts_hist_calls(self) -> None:
        tree = parse_formula("balance + hist_sum('savings', 3, 'month')")
        assert tree is not None

    def test_parse_formula_rejects_unknown_hist_func(self) -> None:
        from app.services.formula import FormulaSyntaxError
        with pytest.raises(FormulaSyntaxError):
            parse_formula("hist_product('x', 1, 'month')")


# ── Integration tests: end-to-end snapshot processing ────────────────────────

async def _register_and_login(client: AsyncClient, email: str, password: str = "password123") -> str:
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    token_resp = await client.post("/api/v1/auth/jwt/login", data={"username": email, "password": password})
    return token_resp.json()["access_token"]


@pytest.mark.asyncio
async def test_hist_sum_aggregates_past_snapshots(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """hist_sum('savings', 3, 'month') sums savings from last 3 months of complete snapshots."""
    token = await _register_and_login(client, "histtest@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create concepts
    sav_resp = await client.post("/api/v1/concepts", json={
        "name": "savings", "kind": "value", "currency_code": "USD",
        "literal_value": 1000, "carry_behaviour": "copy_or_manual",
    }, headers=headers)
    assert sav_resp.status_code == 201

    total_resp = await client.post("/api/v1/concepts", json={
        "name": "total_savings", "kind": "formula", "currency_code": "USD",
        "expression": "hist_sum('savings', 3, 'month')", "carry_behaviour": "auto",
    }, headers=headers)
    assert total_resp.status_code == 201
    total_concept_id = total_resp.json()["id"]

    async def make_complete_snapshot(snap_date: str, savings_value: float) -> None:
        snap = await client.post("/api/v1/snapshots", json={"date": snap_date, "label": None}, headers=headers)
        snap_id = snap.json()["id"]
        # Find the savings entry
        detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
        savings_entry = next(e for e in detail["entries"] if e["concept_id"] == sav_resp.json()["id"])
        await client.patch(
            f"/api/v1/snapshots/{snap_id}/entries/{savings_entry['id']}",
            json={"value": savings_value},
            headers=headers,
        )
        await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
        await client.post(f"/api/v1/snapshots/{snap_id}/complete", headers=headers)

    # Create 3 past complete snapshots
    await make_complete_snapshot("2025-10-01", 1000.0)
    await make_complete_snapshot("2025-11-01", 2000.0)
    await make_complete_snapshot("2025-12-01", 3000.0)

    # Now process a new snapshot for 2026-01
    snap = await client.post("/api/v1/snapshots", json={"date": "2026-01-01", "label": None}, headers=headers)
    snap_id = snap.json()["id"]
    proc = await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
    assert proc.status_code == 200

    detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
    total_entries = [e for e in detail["entries"] if e["concept_id"] == total_concept_id]
    assert len(total_entries) == 1
    # 1000 + 2000 + 3000 = 6000
    assert total_entries[0]["value"] == pytest.approx(6000.0)


@pytest.mark.asyncio
async def test_hist_count_counts_snapshots(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """hist_count returns the number of complete snapshots with a non-null entry for the concept."""
    token = await _register_and_login(client, "histcount@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    sav_resp = await client.post("/api/v1/concepts", json={
        "name": "savings", "kind": "value", "currency_code": "USD",
        "literal_value": 1000, "carry_behaviour": "copy_or_manual",
    }, headers=headers)

    cnt_resp = await client.post("/api/v1/concepts", json={
        "name": "snap_count", "kind": "formula", "currency_code": "USD",
        "expression": "hist_count('savings', 6, 'month')", "carry_behaviour": "auto",
    }, headers=headers)
    count_concept_id = cnt_resp.json()["id"]

    async def make_complete(snap_date: str) -> None:
        snap = await client.post("/api/v1/snapshots", json={"date": snap_date, "label": None}, headers=headers)
        snap_id = snap.json()["id"]
        detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
        sav_entry = next(e for e in detail["entries"] if e["concept_id"] == sav_resp.json()["id"])
        await client.patch(
            f"/api/v1/snapshots/{snap_id}/entries/{sav_entry['id']}",
            json={"value": 500.0},
            headers=headers,
        )
        await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
        await client.post(f"/api/v1/snapshots/{snap_id}/complete", headers=headers)

    await make_complete("2025-08-01")
    await make_complete("2025-09-01")
    await make_complete("2025-10-01")

    snap = await client.post("/api/v1/snapshots", json={"date": "2026-01-01", "label": None}, headers=headers)
    snap_id = snap.json()["id"]
    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
    cnt_entries = [e for e in detail["entries"] if e["concept_id"] == count_concept_id]
    assert cnt_entries[0]["value"] == pytest.approx(3.0)


@pytest.mark.asyncio
async def test_hist_sum_filtered_by_process(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """hist_sum with process filter only aggregates entries from that process's snapshots."""
    token = await _register_and_login(client, "histproc@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    sav_resp = await client.post("/api/v1/concepts", json={
        "name": "savings", "kind": "value", "currency_code": "USD",
        "literal_value": 0, "carry_behaviour": "copy_or_manual",
    }, headers=headers)

    total_resp = await client.post("/api/v1/concepts", json={
        "name": "total_savings", "kind": "formula", "currency_code": "USD",
        "expression": "hist_sum('savings', 12, 'month', 'monthly')", "carry_behaviour": "auto",
    }, headers=headers)
    total_concept_id = total_resp.json()["id"]

    # Create a process called "monthly"
    proc_resp = await client.post("/api/v1/processes", json={
        "name": "monthly", "cadence": "monthly", "concept_scope": "all", "is_active": True,
    }, headers=headers)
    assert proc_resp.status_code == 201
    process_id = proc_resp.json()["id"]

    # Complete a process snapshot (linked to "monthly" process)
    snap = await client.post(f"/api/v1/processes/{process_id}/snapshots", json={
        "date": "2025-12-01", "label": None,
    }, headers=headers)
    assert snap.status_code == 201
    snap_id = snap.json()["id"]
    detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
    sav_entry = next(e for e in detail["entries"] if e["concept_id"] == sav_resp.json()["id"])
    await client.patch(
        f"/api/v1/snapshots/{snap_id}/entries/{sav_entry['id']}",
        json={"value": 5000.0},
        headers=headers,
    )
    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
    await client.post(f"/api/v1/snapshots/{snap_id}/complete", headers=headers)

    # Complete a MANUAL snapshot (not linked to "monthly")
    snap2 = await client.post("/api/v1/snapshots", json={"date": "2025-11-01", "label": None}, headers=headers)
    snap2_id = snap2.json()["id"]
    detail2 = (await client.get(f"/api/v1/snapshots/{snap2_id}", headers=headers)).json()
    sav_entry2 = next(e for e in detail2["entries"] if e["concept_id"] == sav_resp.json()["id"])
    await client.patch(
        f"/api/v1/snapshots/{snap2_id}/entries/{sav_entry2['id']}",
        json={"value": 9999.0},  # should NOT be included in filtered sum
        headers=headers,
    )
    await client.post(f"/api/v1/snapshots/{snap2_id}/process", headers=headers)
    await client.post(f"/api/v1/snapshots/{snap2_id}/complete", headers=headers)

    # Process a new snapshot for 2026-01
    snap3 = await client.post("/api/v1/snapshots", json={"date": "2026-01-01", "label": None}, headers=headers)
    snap3_id = snap3.json()["id"]
    await client.post(f"/api/v1/snapshots/{snap3_id}/process", headers=headers)

    detail3 = (await client.get(f"/api/v1/snapshots/{snap3_id}", headers=headers)).json()
    total_entries = [e for e in detail3["entries"] if e["concept_id"] == total_concept_id]
    # Only the "monthly" process snapshot (5000) should be counted
    assert total_entries[0]["value"] == pytest.approx(5000.0)


@pytest.mark.asyncio
async def test_hist_outside_window_excluded(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """Snapshots older than the period window are excluded from hist_* aggregation."""
    token = await _register_and_login(client, "histwindow@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    sav_resp = await client.post("/api/v1/concepts", json={
        "name": "savings", "kind": "value", "currency_code": "USD",
        "literal_value": 0, "carry_behaviour": "copy_or_manual",
    }, headers=headers)

    total_resp = await client.post("/api/v1/concepts", json={
        "name": "total", "kind": "formula", "currency_code": "USD",
        "expression": "hist_sum('savings', 2, 'month')", "carry_behaviour": "auto",
    }, headers=headers)
    total_concept_id = total_resp.json()["id"]

    async def make_complete(snap_date: str, value: float) -> None:
        snap = await client.post("/api/v1/snapshots", json={"date": snap_date, "label": None}, headers=headers)
        snap_id = snap.json()["id"]
        detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
        sav_entry = next(e for e in detail["entries"] if e["concept_id"] == sav_resp.json()["id"])
        await client.patch(
            f"/api/v1/snapshots/{snap_id}/entries/{sav_entry['id']}",
            json={"value": value},
            headers=headers,
        )
        await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
        await client.post(f"/api/v1/snapshots/{snap_id}/complete", headers=headers)

    # Old snapshot (outside 2-month window from 2026-01-01)
    await make_complete("2025-10-01", 9999.0)
    # Recent snapshots (within 2-month window)
    await make_complete("2025-11-01", 100.0)
    await make_complete("2025-12-01", 200.0)

    snap = await client.post("/api/v1/snapshots", json={"date": "2026-01-01", "label": None}, headers=headers)
    snap_id = snap.json()["id"]
    await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)

    detail = (await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)).json()
    total_entries = [e for e in detail["entries"] if e["concept_id"] == total_concept_id]
    # Only 100 + 200 = 300 (Oct is outside 2-month window)
    assert total_entries[0]["value"] == pytest.approx(300.0)
