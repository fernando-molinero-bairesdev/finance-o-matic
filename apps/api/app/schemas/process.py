import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.process import ProcessCadence, ProcessConceptScope


class ProcessScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    process_id: uuid.UUID
    next_run_at: date | None
    last_run_at: date | None


class ProcessCreate(BaseModel):
    name: str
    cadence: ProcessCadence
    concept_scope: ProcessConceptScope
    selected_concept_ids: list[uuid.UUID] = []


class ProcessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    cadence: ProcessCadence
    concept_scope: ProcessConceptScope
    is_active: bool
    schedule: ProcessScheduleRead | None
    selected_concept_ids: list[uuid.UUID]


class ProcessUpdate(BaseModel):
    name: str | None = None
    cadence: ProcessCadence | None = None
    concept_scope: ProcessConceptScope | None = None
    is_active: bool | None = None
    selected_concept_ids: list[uuid.UUID] | None = None


class ProcessListResponse(BaseModel):
    items: list[ProcessRead]
