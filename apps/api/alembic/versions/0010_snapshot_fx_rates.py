"""snapshot_fx_rates

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'snapshot_fx_rates',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('base_code', sa.String(10), nullable=False),
        sa.Column('quote_code', sa.String(10), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('as_of', sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('snapshot_id', 'base_code', 'quote_code', name='uq_snapshot_fx_rate_pair'),
    )
    op.create_index('ix_snapshot_fx_rates_snapshot_id', 'snapshot_fx_rates', ['snapshot_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_snapshot_fx_rates_snapshot_id', table_name='snapshot_fx_rates')
    op.drop_table('snapshot_fx_rates')
