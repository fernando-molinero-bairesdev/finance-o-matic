import uuid

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """Auth user – columns provided by fastapi-users base class.

    Extra profile columns can be added here in future milestones.
    """

    __tablename__ = "user"

    # Overriding just to satisfy mypy strict; the base already defines these.
    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
