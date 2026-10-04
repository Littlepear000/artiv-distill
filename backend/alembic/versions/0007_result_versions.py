"""result_versions, result_version_rows

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

TABLES = ("result_versions", "result_version_rows")


def upgrade() -> None:
    op.create_table(
        "result_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.Column("source_filename", sa.Text, nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("parent_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("columns", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("row_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("summary", postgresql.JSONB, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_result_versions_tenant_id", "result_versions", ["tenant_id"])
    op.create_index("ix_result_versions_project_id", "result_versions", ["project_id"])

    op.create_table(
        "result_version_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("result_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("report_name", sa.Text, nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("data", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_result_version_rows_tenant_id", "result_version_rows", ["tenant_id"])
    op.create_index("ix_result_version_rows_version_id", "result_version_rows", ["version_id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            """
        )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON result_versions, result_version_rows TO pdf_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON result_versions, result_version_rows FROM pdf_app")
    op.drop_table("result_version_rows")
    op.drop_table("result_versions")
