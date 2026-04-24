"""Unit tests for ConceptCarryBehaviour defaults and DB storage."""

import uuid
from collections.abc import AsyncGenerator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
import app.models.user  # noqa: F401 — registers User table in metadata
import app.models.fx_rate  # noqa: F401
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.currency import Currency

TEST_USER_ID = uuid.uuid4()


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
    yield maker


@pytest.fixture
async def session(session_maker) -> AsyncGenerator[AsyncSession, None]:
    async with session_maker() as s:
        s.add(Currency(code="USD", name="US Dollar"))
        await s.commit()
        yield s


def _concept(kind: ConceptKind, **kwargs) -> Concept:
    return Concept(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        name=f"concept_{uuid.uuid4().hex[:6]}",
        kind=kind,
        currency_code="USD",
        **kwargs,
    )


async def test_carry_behaviour_defaults_to_copy_or_manual_for_value_kind(session: AsyncSession) -> None:
    c = _concept(ConceptKind.value, literal_value=100.0)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    assert c.carry_behaviour == ConceptCarryBehaviour.copy_or_manual


async def test_carry_behaviour_defaults_to_auto_for_formula_kind(session: AsyncSession) -> None:
    c = _concept(ConceptKind.formula, expression="1 + 1")
    session.add(c)
    await session.commit()
    await session.refresh(c)
    assert c.carry_behaviour == ConceptCarryBehaviour.auto


async def test_carry_behaviour_defaults_to_auto_for_group_kind(session: AsyncSession) -> None:
    c = _concept(ConceptKind.group, aggregate_op="sum")
    session.add(c)
    await session.commit()
    await session.refresh(c)
    assert c.carry_behaviour == ConceptCarryBehaviour.auto


async def test_carry_behaviour_defaults_to_copy_for_aux_kind(session: AsyncSession) -> None:
    c = _concept(ConceptKind.aux, expression="0")
    session.add(c)
    await session.commit()
    await session.refresh(c)
    assert c.carry_behaviour == ConceptCarryBehaviour.copy


async def test_carry_behaviour_can_be_overridden_explicitly(session: AsyncSession) -> None:
    c = _concept(ConceptKind.formula, expression="1 + 1", carry_behaviour=ConceptCarryBehaviour.copy)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    assert c.carry_behaviour == ConceptCarryBehaviour.copy


async def test_carry_behaviour_stored_as_string_in_db(session: AsyncSession) -> None:
    c = _concept(ConceptKind.value, literal_value=42.0)
    session.add(c)
    await session.commit()

    row = await session.execute(
        text("SELECT carry_behaviour FROM concepts LIMIT 1"),
    )
    raw_value = row.scalar_one()
    assert raw_value == "copy_or_manual"
