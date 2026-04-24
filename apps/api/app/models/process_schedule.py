import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProcessSchedule(Base):
    __tablename__ = "process_schedules"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    process_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    next_run_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_run_at: Mapped[date | None] = mapped_column(Date, nullable=True)
