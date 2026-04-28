"""add entity_type_id to concepts

Revision ID: da2bd4b4966e
Revises: 0008
Create Date: 2026-04-27 01:17:41.409045

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da2bd4b4966e'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('concept_entries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_concept_entries_entity_id'), ['entity_id'], unique=False)
        batch_op.create_foreign_key('fk_concept_entries_entity_id', 'entities', ['entity_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('concepts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('entity_type_id', sa.Uuid(), nullable=True))
        batch_op.create_index(batch_op.f('ix_concepts_entity_type_id'), ['entity_type_id'], unique=False)
        batch_op.create_foreign_key('fk_concepts_entity_type_id', 'entity_types', ['entity_type_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('concepts', schema=None) as batch_op:
        batch_op.drop_constraint('fk_concepts_entity_type_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_concepts_entity_type_id'))
        batch_op.drop_column('entity_type_id')

    with op.batch_alter_table('concept_entries', schema=None) as batch_op:
        batch_op.drop_constraint('fk_concept_entries_entity_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_concept_entries_entity_id'))
