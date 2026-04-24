import enum
import uuid

from sqlalchemy import Boolean
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProcessCadence(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    manual = "manual"


class ProcessConceptScope(str, enum.Enum):
    all = "all"
    selected = "selected"


class Process(Base):
    __tablename__ = "processes"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cadence: Mapped[ProcessCadence] = mapped_column(
        SQLEnum(ProcessCadence, name="processcadence"), nullable=False
    )
    concept_scope: Mapped[ProcessConceptScope] = mapped_column(
        SQLEnum(ProcessConceptScope, name="processconceptscope"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_process_user_name"),
    )
