import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.concept import ConceptCarryBehaviour
from app.models.snapshot import SnapshotStatus, SnapshotTrigger


class SnapshotCreate(BaseModel):
    date: date
    label: str | None = None


class ConceptEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    snapshot_id: uuid.UUID
    concept_id: uuid.UUID
    value: float | None
    currency_code: str
    carry_behaviour_used: ConceptCarryBehaviour
    formula_snapshot: str | None
    is_pending: bool
    entity_id: uuid.UUID | None


class ConceptEntryResolve(BaseModel):
    value: float
    entity_id: uuid.UUID | None = None


class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    process_id: uuid.UUID | None
    date: date
    label: str | None
    trigger: SnapshotTrigger
    status: SnapshotStatus


class SnapshotDetail(SnapshotRead):
    entries: list[ConceptEntryRead]


class SnapshotListResponse(BaseModel):
    items: list[SnapshotRead]
