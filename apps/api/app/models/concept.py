import enum
import uuid

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ConceptKind(str, enum.Enum):
    value = "value"
    formula = "formula"
    group = "group"
    aux = "aux"


class ConceptCarryBehaviour(str, enum.Enum):
    auto = "auto"
    copy = "copy"
    copy_or_manual = "copy_or_manual"


_CARRY_DEFAULTS: dict[ConceptKind, ConceptCarryBehaviour] = {
    ConceptKind.formula: ConceptCarryBehaviour.auto,
    ConceptKind.group:   ConceptCarryBehaviour.auto,
    ConceptKind.value:   ConceptCarryBehaviour.copy_or_manual,
    ConceptKind.aux:     ConceptCarryBehaviour.copy,
}


class Concept(Base):
    __tablename__ = "concepts"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[ConceptKind] = mapped_column(
        SQLEnum(ConceptKind, name="conceptkind"), nullable=False
    )
    currency_code: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("currencies.code", ondelete="RESTRICT"),
        nullable=False,
    )
    carry_behaviour: Mapped[ConceptCarryBehaviour] = mapped_column(
        SQLEnum(ConceptCarryBehaviour, name="conceptcarrybehaviour"),
        nullable=False,
    )
    literal_value: Mapped[float | None] = mapped_column(nullable=True)
    expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"),
        nullable=True,
    )
    aggregate_op: Mapped[str | None] = mapped_column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_concept_user_name"),
    )

    def __init__(self, **kwargs):
        if "carry_behaviour" not in kwargs and "kind" in kwargs:
            kwargs["carry_behaviour"] = _CARRY_DEFAULTS[kwargs["kind"]]
        super().__init__(**kwargs)
