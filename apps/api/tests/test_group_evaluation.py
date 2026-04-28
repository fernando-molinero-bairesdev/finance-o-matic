"""Tests for group concept evaluation (unit + HTTP integration)."""

import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.concept_group_membership import ConceptGroupMembership
from app.models.currency import Currency
from app.services.formula import FormulaEvaluationError, evaluate_concept_by_id

TEST_EMAIL = "group-eval@example.com"
TEST_PASSWORD = "str0ngPassword!"


# ── fixtures ───────────────────────────────────────────────────────────────────

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


# ── helpers ────────────────────────────────────────────────────────────────────

_USER_ID = uuid.uuid4()


def _concept(kind: ConceptKind, **kwargs) -> Concept:
    return Concept(
        id=uuid.uuid4(),
        user_id=_USER_ID,
        name=f"c_{uuid.uuid4().hex[:6]}",
        kind=kind,
        currency_code="USD",
        carry_behaviour=ConceptCarryBehaviour.auto,
        **kwargs,
    )


def _group_members(*pairs: tuple) -> dict[uuid.UUID, list]:
    """Build group_members dict from (group, child) tuples."""
    result: dict[uuid.UUID, list] = {}
    for group, child in pairs:
        result.setdefault(group.id, []).append(child)
    return result


# ── unit tests ─────────────────────────────────────────────────────────────────

def test_group_sum_of_children() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="sum")
    child1 = _concept(ConceptKind.value, literal_value=100.0)
    child2 = _concept(ConceptKind.value, literal_value=200.0)
    gm = _group_members((parent, child1), (parent, child2))
    result = evaluate_concept_by_id(parent.id, [parent, child1, child2], gm)
    assert result == pytest.approx(300.0)


def test_group_avg_of_children() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="avg")
    children = [_concept(ConceptKind.value, literal_value=float(v)) for v in [100, 200, 300]]
    gm = {parent.id: children}
    result = evaluate_concept_by_id(parent.id, [parent, *children], gm)
    assert result == pytest.approx(200.0)


def test_group_min_of_children() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="min")
    children = [_concept(ConceptKind.value, literal_value=float(v)) for v in [50, 100, 150]]
    gm = {parent.id: children}
    result = evaluate_concept_by_id(parent.id, [parent, *children], gm)
    assert result == pytest.approx(50.0)


def test_group_max_of_children() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="max")
    children = [_concept(ConceptKind.value, literal_value=float(v)) for v in [50, 100, 150]]
    gm = {parent.id: children}
    result = evaluate_concept_by_id(parent.id, [parent, *children], gm)
    assert result == pytest.approx(150.0)


def test_group_no_children_raises() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="sum")
    with pytest.raises(FormulaEvaluationError, match="no children"):
        evaluate_concept_by_id(parent.id, [parent], {})


def test_group_no_aggregate_op_raises() -> None:
    parent = _concept(ConceptKind.group, aggregate_op=None)
    child = _concept(ConceptKind.value, literal_value=1.0)
    gm = {parent.id: [child]}
    with pytest.raises(FormulaEvaluationError, match="aggregate_op"):
        evaluate_concept_by_id(parent.id, [parent, child], gm)


def test_group_unknown_aggregate_op_raises() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="product")
    child = _concept(ConceptKind.value, literal_value=2.0)
    gm = {parent.id: [child]}
    with pytest.raises(FormulaEvaluationError, match="unknown aggregate op"):
        evaluate_concept_by_id(parent.id, [parent, child], gm)


def test_group_children_can_be_formulas() -> None:
    parent = _concept(ConceptKind.group, aggregate_op="sum")
    value_concept = _concept(ConceptKind.value, literal_value=10.0)
    formula_child = _concept(ConceptKind.formula, expression=value_concept.name)
    gm = {parent.id: [formula_child]}
    result = evaluate_concept_by_id(parent.id, [parent, value_concept, formula_child], gm)
    assert result == pytest.approx(10.0)


def test_nested_groups() -> None:
    grandparent = _concept(ConceptKind.group, aggregate_op="sum")
    parent = _concept(ConceptKind.group, aggregate_op="sum")
    child = _concept(ConceptKind.value, literal_value=42.0)
    gm = {grandparent.id: [parent], parent.id: [child]}
    result = evaluate_concept_by_id(grandparent.id, [grandparent, parent, child], gm)
    assert result == pytest.approx(42.0)


def test_concept_belongs_to_multiple_groups() -> None:
    group_a = _concept(ConceptKind.group, aggregate_op="sum")
    group_b = _concept(ConceptKind.group, aggregate_op="sum")
    shared = _concept(ConceptKind.value, literal_value=50.0)
    exclusive = _concept(ConceptKind.value, literal_value=25.0)
    gm = {group_a.id: [shared, exclusive], group_b.id: [shared]}
    assert evaluate_concept_by_id(group_a.id, [group_a, group_b, shared, exclusive], gm) == pytest.approx(75.0)
    assert evaluate_concept_by_id(group_b.id, [group_a, group_b, shared, exclusive], gm) == pytest.approx(50.0)


# ── HTTP integration ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_evaluate_group_concept_via_api(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    user_id = uuid.UUID(reg.json()["id"])
    login = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]

    parent_id = uuid.uuid4()
    child1_id = uuid.uuid4()
    child2_id = uuid.uuid4()
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        parent = Concept(
            id=parent_id,
            user_id=user_id,
            name="total",
            kind=ConceptKind.group,
            currency_code="USD",
            aggregate_op="sum",
        )
        child1 = Concept(
            id=child1_id,
            user_id=user_id,
            name="a",
            kind=ConceptKind.value,
            currency_code="USD",
            literal_value=100.0,
        )
        child2 = Concept(
            id=child2_id,
            user_id=user_id,
            name="b",
            kind=ConceptKind.value,
            currency_code="USD",
            literal_value=200.0,
        )
        session.add_all([parent, child1, child2])
        await session.flush()
        session.add(ConceptGroupMembership(concept_id=child1_id, group_id=parent_id))
        session.add(ConceptGroupMembership(concept_id=child2_id, group_id=parent_id))
        await session.commit()

    resp = await client.post(
        f"/api/v1/concepts/{parent_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == pytest.approx(300.0)
