"""Pure Pydantic unit tests for concept CRUD schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app.models.concept import ConceptCarryBehaviour, ConceptKind
from app.schemas.concept import (
    ConceptCreate,
    ConceptListResponse,
    ConceptRead,
    ConceptUpdate,
)


def test_concept_create_valid_minimal() -> None:
    c = ConceptCreate(name="salary", kind="value", currency_code="USD")
    assert c.name == "salary"
    assert c.kind == ConceptKind.value
    assert c.currency_code == "USD"


def test_concept_create_rejects_missing_name() -> None:
    with pytest.raises(ValidationError):
        ConceptCreate(kind="value", currency_code="USD")  # type: ignore[call-arg]


def test_concept_create_rejects_invalid_kind() -> None:
    with pytest.raises(ValidationError):
        ConceptCreate(name="x", kind="bad", currency_code="USD")


def test_concept_create_carry_behaviour_defaults_to_none() -> None:
    c = ConceptCreate(name="x", kind="value", currency_code="USD")
    assert c.carry_behaviour is None


def test_concept_create_carry_behaviour_can_be_set() -> None:
    c = ConceptCreate(name="x", kind="formula", currency_code="USD", carry_behaviour="copy")
    assert c.carry_behaviour == ConceptCarryBehaviour.copy


def test_concept_read_includes_carry_behaviour() -> None:
    r = ConceptRead(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="salary",
        kind="value",
        currency_code="USD",
        carry_behaviour="copy_or_manual",
        literal_value=None,
        expression=None,
        parent_group_id=None,
        aggregate_op=None,
    )
    assert r.carry_behaviour == ConceptCarryBehaviour.copy_or_manual


def test_concept_update_all_fields_optional() -> None:
    u = ConceptUpdate()
    assert u.name is None
    assert u.kind is None
    assert u.carry_behaviour is None


def test_concept_update_accepts_partial_fields() -> None:
    u = ConceptUpdate(name="renamed")
    assert u.name == "renamed"
    assert u.literal_value is None


def test_concept_list_response_has_items_field() -> None:
    resp = ConceptListResponse(items=[])
    assert resp.items == []
