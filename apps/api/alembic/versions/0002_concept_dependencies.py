"""Add concept dependency edges table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "concept_dependencies",
        sa.Column("concept_id", sa.Uuid(), nullable=False),
        sa.Column("depends_on_concept_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["concept_id"], ["concepts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["depends_on_concept_id"], ["concepts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("concept_id", "depends_on_concept_id", name="pk_concept_dependency_pair"),
    )


def downgrade() -> None:
    op.drop_table("concept_dependencies")

