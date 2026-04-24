"""Add snapshots and concept_entries tables.

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column(
            "trigger",
            sa.Enum("manual", name="snapshottrigger"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "complete", "failed", name="snapshotstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_snapshots_user_id", "snapshots", ["user_id"])

    op.create_table(
        "concept_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("concept_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("currency_code", sa.String(10), nullable=False),
        sa.Column(
            "carry_behaviour_used",
            sa.Enum("auto", "copy", "copy_or_manual", name="conceptcarrybehaviour"),
            nullable=False,
        ),
        sa.Column("formula_snapshot", sa.Text(), nullable=True),
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(
            ["snapshot_id"], ["snapshots.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["concept_id"], ["concepts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_concept_entries_snapshot_id", "concept_entries", ["snapshot_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_concept_entries_snapshot_id", table_name="concept_entries")
    op.drop_table("concept_entries")
    op.drop_index("ix_snapshots_user_id", table_name="snapshots")
    op.drop_table("snapshots")
    op.execute("DROP TYPE IF EXISTS snapshotstatus")
    op.execute("DROP TYPE IF EXISTS snapshottrigger")
