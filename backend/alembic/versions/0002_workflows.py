"""workflows, workflow_nodes, workflow_node_versions + RLS policies

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflows_tenant_id", "workflows", ["tenant_id"])
    op.create_index("ix_workflows_project_id", "workflows", ["project_id"])

    op.create_table(
        "workflow_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.Text, nullable=False, server_default=""),
        sa.Column("prompt", sa.Text, nullable=False, server_default=""),
        sa.Column("order_index", sa.Integer, nullable=False),
        sa.Column("position", postgresql.JSONB, nullable=False, server_default='{"x": 0, "y": 0}'),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_nodes_tenant_id", "workflow_nodes", ["tenant_id"])
    op.create_index("ix_workflow_nodes_workflow_id", "workflow_nodes", ["workflow_id"])

    op.create_table(
        "workflow_node_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_nodes.id"), nullable=False),
        sa.Column("version_no", sa.Integer, nullable=False),
        sa.Column("code_snapshot", sa.Text, nullable=False),
        sa.Column("prompt_snapshot", sa.Text, nullable=False),
        sa.Column("saved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_node_versions_tenant_id", "workflow_node_versions", ["tenant_id"])
    op.create_index("ix_workflow_node_versions_node_id", "workflow_node_versions", ["node_id"])

    for table in ("workflows", "workflow_nodes", "workflow_node_versions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            """
        )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON workflows, workflow_nodes, workflow_node_versions TO pdf_app"
    )


def downgrade() -> None:
    op.execute("REVOKE ALL ON workflows, workflow_nodes, workflow_node_versions FROM pdf_app")
    op.drop_table("workflow_node_versions")
    op.drop_table("workflow_nodes")
    op.drop_table("workflows")
