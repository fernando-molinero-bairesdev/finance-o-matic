import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.concept import Concept, ConceptKind
from app.models.concept_dependency import ConceptDependency
from app.models.currency import Currency

TEST_EMAIL = "formula-user@example.com"
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
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


async def _register_and_login(client: AsyncClient) -> tuple[uuid.UUID, str]:
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert register_resp.status_code == 201
    user_id = uuid.UUID(register_resp.json()["id"])

    login_resp = await client.post(
        "/api/v1/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return user_id, token


@pytest.mark.asyncio
async def test_evaluate_concept_returns_value_and_persists_dependencies(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    user_id, token = await _register_and_login(client)

    salary_id = uuid.uuid4()
    expenses_id = uuid.uuid4()
    savings_id = uuid.uuid4()
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        session.add_all(
            [
                Concept(
                    id=salary_id,
                    user_id=user_id,
                    name="salary",
                    kind=ConceptKind.value,
                    currency_code="USD",
                    literal_value=5000.0,
                ),
                Concept(
                    id=expenses_id,
                    user_id=user_id,
                    name="expenses",
                    kind=ConceptKind.value,
                    currency_code="USD",
                    literal_value=3200.0,
                ),
                Concept(
                    id=savings_id,
                    user_id=user_id,
                    name="savings",
                    kind=ConceptKind.formula,
                    currency_code="USD",
                    expression="salary - expenses",
                ),
            ]
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/concepts/{savings_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["concept_id"] == str(savings_id)
    assert body["kind"] == "formula"
    assert body["value"] == pytest.approx(1800.0)
    assert sorted(body["direct_dependencies"]) == sorted([str(salary_id), str(expenses_id)])

    async with session_maker() as session:
        deps = (
            await session.execute(
                select(ConceptDependency).where(ConceptDependency.concept_id == savings_id)
            )
        ).scalars().all()
    assert sorted(item.depends_on_concept_id for item in deps) == sorted([salary_id, expenses_id])


@pytest.mark.asyncio
async def test_evaluate_concept_rejects_unknown_reference(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    user_id, token = await _register_and_login(client)

    broken_id = uuid.uuid4()
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        session.add(
            Concept(
                id=broken_id,
                user_id=user_id,
                name="broken",
                kind=ConceptKind.formula,
                currency_code="USD",
                expression="missing + 1",
            )
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/concepts/{broken_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "formula_invalid"


@pytest.mark.asyncio
async def test_evaluate_concept_rejects_cycles(
    client: AsyncClient, session_maker: async_sessionmaker[AsyncSession]
) -> None:
    user_id, token = await _register_and_login(client)

    a_id = uuid.uuid4()
    b_id = uuid.uuid4()
    async with session_maker() as session:
        session.add(Currency(code="USD", name="US Dollar"))
        session.add_all(
            [
                Concept(
                    id=a_id,
                    user_id=user_id,
                    name="a",
                    kind=ConceptKind.formula,
                    currency_code="USD",
                    expression="b + 1",
                ),
                Concept(
                    id=b_id,
                    user_id=user_id,
                    name="b",
                    kind=ConceptKind.formula,
                    currency_code="USD",
                    expression="a + 1",
                ),
            ]
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/concepts/{a_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "formula_cycle"

