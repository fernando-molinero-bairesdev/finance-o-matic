import uuid

from pydantic import BaseModel, ConfigDict

from app.models.entity_property_def import EntityPropertyCardinality, EntityPropertyType


# ── EntityType ────────────────────────────────────────────────────────────────

class EntityTypeCreate(BaseModel):
    name: str


class EntityTypeUpdate(BaseModel):
    name: str | None = None


class EntityTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str


# ── EntityPropertyDef ─────────────────────────────────────────────────────────

class EntityPropertyDefCreate(BaseModel):
    name: str
    value_type: EntityPropertyType
    ref_entity_type_id: uuid.UUID | None = None
    cardinality: EntityPropertyCardinality = EntityPropertyCardinality.one
    nullable: bool = True
    display_order: int = 0


class EntityPropertyDefUpdate(BaseModel):
    name: str | None = None
    ref_entity_type_id: uuid.UUID | None = None
    cardinality: EntityPropertyCardinality | None = None
    nullable: bool | None = None
    display_order: int | None = None


class EntityPropertyDefRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type_id: uuid.UUID
    name: str
    value_type: EntityPropertyType
    ref_entity_type_id: uuid.UUID | None
    cardinality: EntityPropertyCardinality
    nullable: bool
    display_order: int


class EntityTypeDetail(EntityTypeRead):
    properties: list[EntityPropertyDefRead]


class EntityTypeListResponse(BaseModel):
    items: list[EntityTypeDetail]


# ── EntityPropertyValue ───────────────────────────────────────────────────────

class EntityPropertyValueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    property_def_id: uuid.UUID
    value_decimal: float | None
    value_string: str | None
    value_date: str | None  # returned as ISO string
    ref_entity_id: uuid.UUID | None


class EntityPropertyValueItem(BaseModel):
    value_decimal: float | None = None
    value_string: str | None = None
    value_date: str | None = None
    ref_entity_id: uuid.UUID | None = None


class EntityPropertyValueSet(BaseModel):
    """Body for PUT /entities/{id}/properties/{prop_def_id} — replaces all values."""
    values: list[dict]  # list of {value_decimal?, value_string?, value_date?, ref_entity_id?}


# ── Entity ────────────────────────────────────────────────────────────────────

class EntityCreate(BaseModel):
    name: str
    entity_type_id: uuid.UUID


class EntityUpdate(BaseModel):
    name: str | None = None


class EntityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entity_type_id: uuid.UUID
    name: str


class EntityDetail(EntityRead):
    properties: list[EntityPropertyDefRead]
    values: list[EntityPropertyValueRead]


class EntityListResponse(BaseModel):
    items: list[EntityRead]
