"""report_fields.group_name

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("report_fields", sa.Column("group_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("report_fields", "group_name")
