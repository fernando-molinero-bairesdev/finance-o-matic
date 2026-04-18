import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FxRate(Base):
    __tablename__ = "fx_rates"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    base_code: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code", ondelete="RESTRICT"))
    quote_code: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code", ondelete="RESTRICT"))
    rate: Mapped[float] = mapped_column(Float, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint("base_code", "quote_code", "as_of", name="uq_fx_rate_pair_date"),
    )
