import enum
import uuid
from datetime import date

from sqlalchemy import Date
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SnapshotStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"


class SnapshotTrigger(str, enum.Enum):
    manual = "manual"


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("processes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trigger: Mapped[SnapshotTrigger] = mapped_column(
        SQLEnum(SnapshotTrigger, name="snapshottrigger"), nullable=False
    )
    status: Mapped[SnapshotStatus] = mapped_column(
        SQLEnum(SnapshotStatus, name="snapshotstatus"),
        nullable=False,
        default=SnapshotStatus.pending,
    )
