import uuid

from pydantic import BaseModel

from app.models.concept import ConceptKind


class ConceptEvaluateResponse(BaseModel):
    concept_id: uuid.UUID
    kind: ConceptKind
    currency_code: str
    value: float
    direct_dependencies: list[uuid.UUID]

