import uuid
from datetime import date as date_type

from pydantic import BaseModel, ConfigDict

from app.models.concept import ConceptCarryBehaviour, ConceptKind


class ConceptCreate(BaseModel):
    name: str
    kind: ConceptKind
    currency_code: str
    carry_behaviour: ConceptCarryBehaviour | None = None
    literal_value: float | None = None
    expression: str | None = None
    group_ids: list[uuid.UUID] = []
    aggregate_op: str | None = None
    entity_type_id: uuid.UUID | None = None


class ConceptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    kind: ConceptKind
    currency_code: str
    carry_behaviour: ConceptCarryBehaviour
    literal_value: float | None
    expression: str | None
    group_ids: list[uuid.UUID] = []
    aggregate_op: str | None
    entity_type_id: uuid.UUID | None = None


class ConceptUpdate(BaseModel):
    name: str | None = None
    kind: ConceptKind | None = None
    currency_code: str | None = None
    carry_behaviour: ConceptCarryBehaviour | None = None
    literal_value: float | None = None
    expression: str | None = None
    group_ids: list[uuid.UUID] | None = None
    aggregate_op: str | None = None
    entity_type_id: uuid.UUID | None = None


class ConceptListResponse(BaseModel):
    items: list[ConceptRead]


class ConceptEvaluateResponse(BaseModel):
    concept_id: uuid.UUID
    kind: ConceptKind
    currency_code: str
    value: float
    direct_dependencies: list[uuid.UUID]


class ConceptHistoryPoint(BaseModel):
    snapshot_id: uuid.UUID
    date: date_type
    value: float | None
    currency_code: str
