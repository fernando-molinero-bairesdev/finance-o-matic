"""Add processes, process_schedules, process_concepts; add process_id to snapshots.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "cadence",
            sa.Enum("daily", "weekly", "monthly", "quarterly", "manual", name="processcadence"),
            nullable=False,
        ),
        sa.Column(
            "concept_scope",
            sa.Enum("all", "selected", name="processconceptscope"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_process_user_name"),
    )
    op.create_index("ix_processes_user_id", "processes", ["user_id"])

    op.create_table(
        "process_schedules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("process_id", sa.Uuid(), nullable=False),
        sa.Column("next_run_at", sa.Date(), nullable=True),
        sa.Column("last_run_at", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id"),
    )
    op.create_index("ix_process_schedules_process_id", "process_schedules", ["process_id"])

    op.create_table(
        "process_concepts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("process_id", sa.Uuid(), nullable=False),
        sa.Column("concept_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["concept_id"], ["concepts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id", "concept_id", name="uq_process_concept"),
    )
    op.create_index("ix_process_concepts_process_id", "process_concepts", ["process_id"])

    with op.batch_alter_table("snapshots") as batch_op:
        batch_op.add_column(sa.Column("process_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_snapshots_process_id",
            "processes",
            ["process_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_snapshots_process_id", "snapshots", ["process_id"])


def downgrade() -> None:
    op.drop_index("ix_snapshots_process_id", table_name="snapshots")
    with op.batch_alter_table("snapshots") as batch_op:
        batch_op.drop_constraint("fk_snapshots_process_id", type_="foreignkey")
        batch_op.drop_column("process_id")

    op.drop_index("ix_process_concepts_process_id", table_name="process_concepts")
    op.drop_table("process_concepts")

    op.drop_index("ix_process_schedules_process_id", table_name="process_schedules")
    op.drop_table("process_schedules")

    op.drop_index("ix_processes_user_id", table_name="processes")
    op.drop_table("processes")

    op.execute("DROP TYPE IF EXISTS processconceptscope")
    op.execute("DROP TYPE IF EXISTS processcadence")
