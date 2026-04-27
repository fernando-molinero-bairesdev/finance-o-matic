import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type_id", "name", name="uq_entity_user_type_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entity_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
