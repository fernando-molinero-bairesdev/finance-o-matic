import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EntityPropertyType(str, enum.Enum):
    decimal = "decimal"
    string = "string"
    date = "date"
    entity_ref = "entity_ref"


class EntityPropertyCardinality(str, enum.Enum):
    one = "one"
    many = "many"


class EntityPropertyDef(Base):
    __tablename__ = "entity_property_defs"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    entity_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entity_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    value_type: Mapped[EntityPropertyType] = mapped_column(
        SQLEnum(EntityPropertyType, name="entitypropertytype"),
        nullable=False,
    )
    ref_entity_type_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("entity_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    cardinality: Mapped[EntityPropertyCardinality] = mapped_column(
        SQLEnum(EntityPropertyCardinality, name="entitypropertycardinality"),
        nullable=False,
        default=EntityPropertyCardinality.one,
    )
    nullable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
