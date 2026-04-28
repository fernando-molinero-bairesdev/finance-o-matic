"""many_to_many_groups

Revision ID: 0009
Revises: da2bd4b4966e
Create Date: 2026-04-27 12:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = '0009'
down_revision: Union[str, None] = 'da2bd4b4966e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'concept_group_memberships',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('concept_id', sa.Uuid(), nullable=False),
        sa.Column('group_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['group_id'], ['concepts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('concept_id', 'group_id', name='uq_cgm_concept_group'),
    )
    op.create_index('ix_concept_group_memberships_concept_id', 'concept_group_memberships', ['concept_id'], unique=False)
    op.create_index('ix_concept_group_memberships_group_id', 'concept_group_memberships', ['group_id'], unique=False)

    # Migrate existing parent_group_id data into the junction table
    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT id, parent_group_id FROM concepts WHERE parent_group_id IS NOT NULL")
    ).fetchall()
    for row in rows:
        conn.execute(
            text(
                "INSERT INTO concept_group_memberships (id, concept_id, group_id) "
                "VALUES (:id, :concept_id, :group_id)"
            ),
            {"id": str(uuid.uuid4()), "concept_id": str(row[0]), "group_id": str(row[1])},
        )

    # Drop the now-migrated column
    with op.batch_alter_table('concepts', schema=None) as batch_op:
        batch_op.drop_constraint('fk_concepts_parent_group_id', type_='foreignkey')
        batch_op.drop_column('parent_group_id')


def downgrade() -> None:
    with op.batch_alter_table('concepts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('parent_group_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            'fk_concepts_parent_group_id', 'concepts', ['parent_group_id'], ['id'], ondelete='SET NULL'
        )

    # Restore first membership per concept as parent_group_id
    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT concept_id, group_id FROM concept_group_memberships")
    ).fetchall()
    seen: set = set()
    for row in rows:
        if row[0] not in seen:
            seen.add(row[0])
            conn.execute(
                text("UPDATE concepts SET parent_group_id = :gid WHERE id = :cid"),
                {"gid": str(row[1]), "cid": str(row[0])},
            )

    op.drop_index('ix_concept_group_memberships_group_id', table_name='concept_group_memberships')
    op.drop_index('ix_concept_group_memberships_concept_id', table_name='concept_group_memberships')
    op.drop_table('concept_group_memberships')
