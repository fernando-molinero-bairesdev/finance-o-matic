"""Add 'open' and 'processed' values to SnapshotStatus enum.

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-26

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE snapshotstatus ADD VALUE IF NOT EXISTS 'open'")
        op.execute("ALTER TYPE snapshotstatus ADD VALUE IF NOT EXISTS 'processed'")
    # SQLite stores enums as VARCHAR — no schema change needed


def downgrade() -> None:
    # PostgreSQL: cannot remove enum values without recreating the type.
    # For SQLite: no-op.
    pass
