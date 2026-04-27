import uuid

from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.concept import ConceptCarryBehaviour


class ConceptEntry(Base):
    __tablename__ = "concept_entries"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False,
    )
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency_code: Mapped[str] = mapped_column(String(10), nullable=False)
    carry_behaviour_used: Mapped[ConceptCarryBehaviour] = mapped_column(
        SQLEnum(ConceptCarryBehaviour, name="conceptcarrybehaviour"),
        nullable=False,
    )
    formula_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("entities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
