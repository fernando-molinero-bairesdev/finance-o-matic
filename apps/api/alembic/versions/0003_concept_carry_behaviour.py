"""Add carry_behaviour to concepts table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("concepts") as batch_op:
        batch_op.add_column(
            sa.Column(
                "carry_behaviour",
                sa.Enum("auto", "copy", "copy_or_manual", name="conceptcarrybehaviour"),
                nullable=False,
                server_default="auto",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("concepts") as batch_op:
        batch_op.drop_column("carry_behaviour")
    op.execute("DROP TYPE IF EXISTS conceptcarrybehaviour")
