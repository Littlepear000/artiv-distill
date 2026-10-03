"""workflow_runs, node_runs, files + RLS policies

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_status_enum = postgresql.ENUM(
        "pending", "running", "success", "failed", name="run_status", create_type=False
    )
    file_source_enum = postgresql.ENUM("upload", "node_output", name="file_source", create_type=False)
    run_status_enum.create(op.get_bind(), checkfirst=True)
    file_source_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "workflow_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("status", run_status_enum, nullable=False, server_default="pending"),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("input_file_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_workflow_runs_tenant_id", "workflow_runs", ["tenant_id"])
    op.create_index("ix_workflow_runs_workflow_id", "workflow_runs", ["workflow_id"])

    op.create_table(
        "node_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "workflow_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_runs.id"), nullable=False
        ),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_nodes.id"), nullable=False),
        sa.Column("order_index", sa.Integer, nullable=False),
        sa.Column("status", run_status_enum, nullable=False, server_default="pending"),
        sa.Column("input_file_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("output_file_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("logs", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_node_runs_tenant_id", "node_runs", ["tenant_id"])
    op.create_index("ix_node_runs_workflow_run_id", "node_runs", ["workflow_run_id"])

    op.create_table(
        "files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "workflow_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_runs.id"), nullable=True
        ),
        sa.Column("node_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("node_runs.id"), nullable=True),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False, server_default="application/octet-stream"),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("source", file_source_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_files_tenant_id", "files", ["tenant_id"])
    op.create_index("ix_files_project_id", "files", ["project_id"])
    op.create_index("ix_files_workflow_run_id", "files", ["workflow_run_id"])

    for table in ("workflow_runs", "node_runs", "files"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            """
        )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_runs, node_runs, files TO pdf_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON workflow_runs, node_runs, files FROM pdf_app")
    op.drop_table("files")
    op.drop_table("node_runs")
    op.drop_table("workflow_runs")
    op.execute("DROP TYPE file_source")
    op.execute("DROP TYPE run_status")
