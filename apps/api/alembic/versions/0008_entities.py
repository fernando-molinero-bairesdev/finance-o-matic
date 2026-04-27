"""Add entity_types, entity_property_defs, entities, entity_property_values tables;
add entity_id to concept_entries.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entity_types",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_entity_type_user_name"),
    )
    op.create_index(op.f("ix_entity_types_user_id"), "entity_types", ["user_id"])

    op.create_table(
        "entity_property_defs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("value_type", sa.String(20), nullable=False),
        sa.Column("ref_entity_type_id", sa.Uuid(), nullable=True),
        sa.Column("cardinality", sa.String(10), nullable=False, server_default="one"),
        sa.Column("nullable", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["entity_type_id"], ["entity_types.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["ref_entity_type_id"], ["entity_types.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_type_id", "name", name="uq_epd_type_name"),
    )
    op.create_index(
        op.f("ix_entity_property_defs_entity_type_id"),
        "entity_property_defs",
        ["entity_type_id"],
    )

    op.create_table(
        "entities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["entity_type_id"], ["entity_types.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "entity_type_id", "name", name="uq_entity_user_type_name"
        ),
    )
    op.create_index(op.f("ix_entities_user_id"), "entities", ["user_id"])
    op.create_index(op.f("ix_entities_entity_type_id"), "entities", ["entity_type_id"])

    op.create_table(
        "entity_property_values",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("property_def_id", sa.Uuid(), nullable=False),
        sa.Column("value_decimal", sa.Float(), nullable=True),
        sa.Column("value_string", sa.Text(), nullable=True),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("ref_entity_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["entity_id"], ["entities.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["property_def_id"], ["entity_property_defs.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["ref_entity_id"], ["entities.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_entity_property_values_entity_id"),
        "entity_property_values",
        ["entity_id"],
    )

    with op.batch_alter_table("concept_entries") as batch_op:
        batch_op.add_column(sa.Column("entity_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_concept_entries_entity_id",
            "entities",
            ["entity_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            op.f("ix_concept_entries_entity_id"), ["entity_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("concept_entries") as batch_op:
        batch_op.drop_index(op.f("ix_concept_entries_entity_id"))
        batch_op.drop_constraint("fk_concept_entries_entity_id", type_="foreignkey")
        batch_op.drop_column("entity_id")

    op.drop_index(
        op.f("ix_entity_property_values_entity_id"),
        table_name="entity_property_values",
    )
    op.drop_table("entity_property_values")

    op.drop_index(op.f("ix_entities_entity_type_id"), table_name="entities")
    op.drop_index(op.f("ix_entities_user_id"), table_name="entities")
    op.drop_table("entities")

    op.drop_index(
        op.f("ix_entity_property_defs_entity_type_id"),
        table_name="entity_property_defs",
    )
    op.drop_table("entity_property_defs")

    op.drop_index(op.f("ix_entity_types_user_id"), table_name="entity_types")
    op.drop_table("entity_types")
