import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EntityType(Base):
    __tablename__ = "entity_types"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_entity_type_user_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
