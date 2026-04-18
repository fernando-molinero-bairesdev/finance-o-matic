"""Initial schema: users, currencies, fx_rates, concepts

Revision ID: 0001
Revises:
Create Date: 2026-04-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "user",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)

    # --- currencies ---
    op.create_table(
        "currencies",
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )

    # --- fx_rates ---
    op.create_table(
        "fx_rates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("base_code", sa.String(length=10), nullable=False),
        sa.Column("quote_code", sa.String(length=10), nullable=False),
        sa.Column("rate", sa.Float(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["base_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["quote_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("base_code", "quote_code", "as_of", name="uq_fx_rate_pair_date"),
    )

    # --- concepts ---
    op.create_table(
        "concepts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("value", "formula", "group", "aux", name="conceptkind"),
            nullable=False,
        ),
        sa.Column("currency_code", sa.String(length=10), nullable=False),
        sa.Column("literal_value", sa.Float(), nullable=True),
        sa.Column("expression", sa.Text(), nullable=True),
        sa.Column("parent_group_id", sa.Uuid(), nullable=True),
        sa.Column("aggregate_op", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["parent_group_id"], ["concepts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_concept_user_name"),
    )
    op.create_index(op.f("ix_concepts_user_id"), "concepts", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_concepts_user_id"), table_name="concepts")
    op.drop_table("concepts")
    op.drop_table("fx_rates")
    op.drop_table("currencies")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
