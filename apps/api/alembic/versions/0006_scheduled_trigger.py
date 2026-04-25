"""Add 'scheduled' value to SnapshotTrigger enum.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-24

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE snapshottrigger ADD VALUE IF NOT EXISTS 'scheduled'")
    # SQLite stores enums as VARCHAR — no schema change needed


def downgrade() -> None:
    # PostgreSQL: cannot remove an enum value without recreating the type.
    # For SQLite: no-op.
    pass
