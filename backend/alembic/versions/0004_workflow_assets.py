"""workflow_assets, workflow_asset_versions + node asset references

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    asset_kind_enum = postgresql.ENUM("code", "prompt", name="asset_kind", create_type=False)
    asset_kind_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "workflow_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("kind", asset_kind_enum, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_assets_tenant_id", "workflow_assets", ["tenant_id"])
    op.create_index("ix_workflow_assets_project_id", "workflow_assets", ["project_id"])
    op.create_index("ix_workflow_assets_kind", "workflow_assets", ["kind"])

    op.create_table(
        "workflow_asset_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_assets.id"), nullable=False),
        sa.Column("version_no", sa.Integer, nullable=False),
        sa.Column("content_snapshot", sa.Text, nullable=False),
        sa.Column("saved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflow_asset_versions_tenant_id", "workflow_asset_versions", ["tenant_id"])
    op.create_index("ix_workflow_asset_versions_asset_id", "workflow_asset_versions", ["asset_id"])

    for table in ("workflow_assets", "workflow_asset_versions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
            """
        )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_assets, workflow_asset_versions TO pdf_app")

    op.add_column(
        "workflow_nodes",
        sa.Column(
            "code_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("workflow_nodes", sa.Column("code_asset_version", sa.Integer, nullable=True))
    op.add_column(
        "workflow_nodes",
        sa.Column(
            "prompt_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("workflow_nodes", sa.Column("prompt_asset_version", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("workflow_nodes", "prompt_asset_version")
    op.drop_column("workflow_nodes", "prompt_asset_id")
    op.drop_column("workflow_nodes", "code_asset_version")
    op.drop_column("workflow_nodes", "code_asset_id")
    op.execute("REVOKE ALL ON workflow_assets, workflow_asset_versions FROM pdf_app")
    op.drop_table("workflow_asset_versions")
    op.drop_table("workflow_assets")
    op.execute("DROP TYPE asset_kind")
