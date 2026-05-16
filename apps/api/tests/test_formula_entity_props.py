"""Tests for prop_* entity property variables in formula evaluation."""
import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency
from app.services.formula.engine import (
    _evaluate_expression,
    extract_reference_names,
    parse_formula,
)
from app.services.formula import FormulaEvaluationError


# ── Fixtures ─────────────────────────────────────────────────────────────────

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


# ── Unit tests: engine-level ──────────────────────────────────────────────────

class TestPropVarsEngine:
    def test_prop_name_not_in_reference_names(self) -> None:
        """prop_* identifiers should not be treated as concept references."""
        refs = extract_reference_names("salary * prop_rate")
        assert "salary" in refs
        assert "prop_rate" not in refs

    def test_only_prop_name_yields_empty_references(self) -> None:
        refs = extract_reference_names("prop_value * 1.2")
        assert refs == set()

    def test_evaluate_expression_with_extra_vars(self) -> None:
        result = _evaluate_expression("income * prop_rate", {"income": 10000.0}, extra_vars={"prop_rate": 0.3})
        assert result == pytest.approx(3000.0)

    def test_evaluate_expression_extra_vars_override(self) -> None:
        """extra_vars can shadow concept variables if names collide."""
        result = _evaluate_expression("x + prop_x", {"x": 1.0}, extra_vars={"prop_x": 99.0})
        assert result == pytest.approx(100.0)

    def test_evaluate_expression_no_extra_vars(self) -> None:
        """Formula with only concept refs works without extra_vars."""
        result = _evaluate_expression("a + b", {"a": 5.0, "b": 3.0})
        assert result == pytest.approx(8.0)

    def test_prop_name_passes_validator(self) -> None:
        tree = parse_formula("income * prop_rate + prop_bonus")
        assert tree is not None

    def test_missing_prop_var_raises_at_eval_time(self) -> None:
        """If a prop_* var is referenced but not provided, a NameError-wrapped error occurs."""
        with pytest.raises(FormulaEvaluationError):
            _evaluate_expression("income * prop_rate", {"income": 5000.0})


# ── Integration tests: snapshot processing ───────────────────────────────────

async def _register_and_login(client: AsyncClient, email: str, password: str = "password123") -> str:
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    token_resp = await client.post("/api/v1/auth/jwt/login", data={"username": email, "password": password})
    return token_resp.json()["access_token"]


@pytest.mark.asyncio
async def test_process_snapshot_injects_entity_props(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """Auto entries for per-entity concepts can use prop_* in formulas."""
    token = await _register_and_login(client, "proptest@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create EntityType with decimal property "rate"
    et_resp = await client.post("/api/v1/entity-types", json={"name": "Account"}, headers=headers)
    assert et_resp.status_code == 201
    et_id = et_resp.json()["id"]

    prop_resp = await client.post(
        f"/api/v1/entity-types/{et_id}/properties",
        json={"name": "rate", "value_type": "decimal"},
        headers=headers,
    )
    assert prop_resp.status_code == 201
    prop_def_id = prop_resp.json()["id"]

    ent_resp = await client.post(
        "/api/v1/entities",
        json={"name": "Savings", "entity_type_id": et_id},
        headers=headers,
    )
    assert ent_resp.status_code == 201
    ent_id = ent_resp.json()["id"]

    # Set property value "rate" = 0.05 (body is a list of EntityPropertyValueItem)
    set_resp = await client.put(
        f"/api/v1/entities/{ent_id}/properties/{prop_def_id}",
        json=[{"value_decimal": 0.05}],
        headers=headers,
    )
    assert set_resp.status_code == 200

    # balance = value concept, interest = auto formula using prop_rate
    await client.post("/api/v1/concepts", json={
        "name": "balance", "kind": "value", "currency_code": "USD",
        "literal_value": 10000, "carry_behaviour": "copy_or_manual",
    }, headers=headers)

    int_resp = await client.post("/api/v1/concepts", json={
        "name": "interest", "kind": "formula", "currency_code": "USD",
        "expression": "balance * prop_rate", "carry_behaviour": "auto",
        "entity_type_id": et_id,
    }, headers=headers)
    assert int_resp.status_code == 201
    interest_concept_id = int_resp.json()["id"]

    snap_resp = await client.post("/api/v1/snapshots", json={
        "date": "2026-01-01", "label": None,
    }, headers=headers)
    assert snap_resp.status_code == 201
    snap_id = snap_resp.json()["id"]

    proc_resp = await client.post(f"/api/v1/snapshots/{snap_id}/process", headers=headers)
    assert proc_resp.status_code == 200

    detail = await client.get(f"/api/v1/snapshots/{snap_id}", headers=headers)
    entries = detail.json()["entries"]
    interest_entries = [e for e in entries if e["concept_id"] == interest_concept_id]
    assert len(interest_entries) == 1
    assert interest_entries[0]["value"] == pytest.approx(500.0)  # 10000 * 0.05


@pytest.mark.asyncio
async def test_preview_formula_with_entity_id(
    client: AsyncClient,
    session_maker,
    seeded_currencies,
) -> None:
    """Preview formula with entity_id returns result with prop_* vars injected."""
    token = await _register_and_login(client, "prevprop@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    et_resp = await client.post("/api/v1/entity-types", json={"name": "Loan"}, headers=headers)
    assert et_resp.status_code == 201
    et_id = et_resp.json()["id"]

    prop_resp = await client.post(
        f"/api/v1/entity-types/{et_id}/properties",
        json={"name": "interest_rate", "value_type": "decimal"},
        headers=headers,
    )
    assert prop_resp.status_code == 201
    prop_def_id = prop_resp.json()["id"]

    ent_resp = await client.post(
        "/api/v1/entities",
        json={"name": "Car Loan", "entity_type_id": et_id},
        headers=headers,
    )
    assert ent_resp.status_code == 201
    ent_id = ent_resp.json()["id"]

    await client.put(
        f"/api/v1/entities/{ent_id}/properties/{prop_def_id}",
        json=[{"value_decimal": 0.06}],
        headers=headers,
    )

    await client.post("/api/v1/concepts", json={
        "name": "principal", "kind": "value", "currency_code": "USD",
        "literal_value": 20000, "carry_behaviour": "copy_or_manual",
    }, headers=headers)

    preview_resp = await client.post(
        "/api/v1/formulas/preview",
        json={"expression": "principal * prop_interest_rate", "entity_id": ent_id},
        headers=headers,
    )
    assert preview_resp.status_code == 200
    data = preview_resp.json()
    assert data["error"] is None
    assert data["value"] == pytest.approx(1200.0)  # 20000 * 0.06
