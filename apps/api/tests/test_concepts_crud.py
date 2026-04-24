"""Integration tests for Concept CRUD endpoints."""

import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base, get_async_session
from app.main import app
from app.models.currency import Currency

TEST_EMAIL = "concepts-crud@example.com"
TEST_EMAIL_B = "concepts-crud-b@example.com"
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
        session.add(Currency(code="EUR", name="Euro"))
        await session.commit()


async def _register_and_login(client: AsyncClient, email: str = TEST_EMAIL) -> tuple[uuid.UUID, str]:
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert reg.status_code == 201
    user_id = uuid.UUID(reg.json()["id"])
    login = await client.post("/api/v1/auth/jwt/login", data={"username": email, "password": TEST_PASSWORD})
    assert login.status_code == 200
    return user_id, login.json()["access_token"]


# ── CREATE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_value_concept_returns_201_with_copy_or_manual(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 5000.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "salary"
    assert body["kind"] == "value"
    assert body["carry_behaviour"] == "copy_or_manual"
    assert body["literal_value"] == 5000.0
    assert "id" in body


@pytest.mark.asyncio
async def test_create_formula_concept_has_auto_carry_behaviour(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "net", "kind": "formula", "currency_code": "USD", "expression": "1 + 1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["carry_behaviour"] == "auto"


@pytest.mark.asyncio
async def test_create_group_concept_has_auto_carry_behaviour(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "total", "kind": "group", "currency_code": "USD", "aggregate_op": "sum"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["carry_behaviour"] == "auto"


@pytest.mark.asyncio
async def test_create_aux_concept_has_copy_carry_behaviour(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "helper", "kind": "aux", "currency_code": "USD", "expression": "0"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["carry_behaviour"] == "copy"


@pytest.mark.asyncio
async def test_create_explicit_carry_behaviour_overrides_default(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "x", "kind": "value", "currency_code": "USD", "carry_behaviour": "copy"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["carry_behaviour"] == "copy"


@pytest.mark.asyncio
async def test_create_duplicate_name_returns_409(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    payload = {"name": "salary", "kind": "value", "currency_code": "USD"}
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/concepts", json=payload, headers=headers)
    resp = await client.post("/api/v1/concepts", json=payload, headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_unknown_currency_returns_422(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    resp = await client.post(
        "/api/v1/concepts",
        json={"name": "x", "kind": "value", "currency_code": "ZZZ"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ── GET ────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_concept_returns_200(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    concept_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/concepts/{concept_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "salary"


@pytest.mark.asyncio
async def test_get_concept_not_found_returns_404(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.get(
        f"/api/v1/concepts/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_concept_other_user_returns_404(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)

    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    concept_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/concepts/{concept_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


# ── LIST ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_concepts_empty_for_new_user(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.get("/api/v1/concepts", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_list_concepts_returns_all_user_concepts(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    for name in ["a", "b", "c"]:
        await client.post(
            "/api/v1/concepts",
            json={"name": name, "kind": "value", "currency_code": "USD"},
            headers=headers,
        )
    resp = await client.get("/api/v1/concepts", headers=headers)
    assert len(resp.json()["items"]) == 3


@pytest.mark.asyncio
async def test_list_does_not_leak_other_user_concepts(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)

    for name in ["a", "b"]:
        await client.post(
            "/api/v1/concepts",
            json={"name": name, "kind": "value", "currency_code": "USD"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
    await client.post(
        "/api/v1/concepts",
        json={"name": "c", "kind": "value", "currency_code": "USD"},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    resp = await client.get("/api/v1/concepts", headers={"Authorization": f"Bearer {token_a}"})
    assert len(resp.json()["items"]) == 2


# ── UPDATE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_concept_name_returns_200(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 5000.0},
        headers=headers,
    )
    concept_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/concepts/{concept_id}",
        json={"name": "new_salary"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "new_salary"


@pytest.mark.asyncio
async def test_update_only_changes_provided_fields(
    client: AsyncClient, seeded_currencies
) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD", "literal_value": 5000.0},
        headers=headers,
    )
    concept_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/concepts/{concept_id}", json={"name": "renamed"}, headers=headers
    )
    assert resp.json()["literal_value"] == 5000.0


@pytest.mark.asyncio
async def test_update_not_found_returns_404(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.put(
        f"/api/v1/concepts/{uuid.uuid4()}",
        json={"name": "x"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_other_user_returns_404(client: AsyncClient, seeded_currencies) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    concept_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/concepts/{concept_id}",
        json={"name": "hacked"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


# ── DELETE ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_returns_204(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    concept_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/concepts/{concept_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_removes_from_list(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers=headers,
    )
    concept_id = create_resp.json()["id"]
    await client.delete(f"/api/v1/concepts/{concept_id}", headers=headers)
    list_resp = await client.get("/api/v1/concepts", headers=headers)
    assert list_resp.json()["items"] == []


@pytest.mark.asyncio
async def test_delete_not_found_returns_404(client: AsyncClient, seeded_currencies) -> None:
    _, token = await _register_and_login(client)
    resp = await client.delete(
        f"/api/v1/concepts/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_other_user_returns_404(client: AsyncClient, seeded_currencies) -> None:
    _, token_a = await _register_and_login(client, TEST_EMAIL)
    _, token_b = await _register_and_login(client, TEST_EMAIL_B)
    create_resp = await client.post(
        "/api/v1/concepts",
        json={"name": "salary", "kind": "value", "currency_code": "USD"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    concept_id = create_resp.json()["id"]
    resp = await client.delete(
        f"/api/v1/concepts/{concept_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


# ── AUTH ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_all_endpoints_require_auth(client: AsyncClient) -> None:
    cid = uuid.uuid4()
    assert (await client.get("/api/v1/concepts")).status_code == 401
    assert (await client.post("/api/v1/concepts", json={})).status_code == 401
    assert (await client.get(f"/api/v1/concepts/{cid}")).status_code == 401
    assert (await client.put(f"/api/v1/concepts/{cid}", json={})).status_code == 401
    assert (await client.delete(f"/api/v1/concepts/{cid}")).status_code == 401
