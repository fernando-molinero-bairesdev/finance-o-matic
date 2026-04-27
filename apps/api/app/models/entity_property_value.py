import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EntityPropertyValue(Base):
    __tablename__ = "entity_property_values"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_def_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entity_property_defs.id", ondelete="CASCADE"),
        nullable=False,
    )
    value_decimal: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_string: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ref_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("entities.id", ondelete="SET NULL"),
        nullable=True,
    )
