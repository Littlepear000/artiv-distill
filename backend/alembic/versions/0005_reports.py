"""report_fields, reports, report_field_values

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

TABLES = ("report_fields", "reports", "report_field_values")


def upgrade() -> None:
    op.create_table(
        "report_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("data_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("allow_import", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("allow_extract", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("auto_select", sa.String(20), nullable=False, server_default="system_first"),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "key", name="uq_report_field_project_key"),
    )
    op.create_index("ix_report_fields_tenant_id", "report_fields", ["tenant_id"])
    op.create_index("ix_report_fields_project_id", "report_fields", ["project_id"])

    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("storage_key", sa.Text, nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "name", name="uq_report_project_name"),
    )
    op.create_index("ix_reports_tenant_id", "reports", ["tenant_id"])
    op.create_index("ix_reports_project_id", "reports", ["project_id"])

    op.create_table(
        "report_field_values",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("report_fields.id"), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_selected", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_report_field_values_tenant_id", "report_field_values", ["tenant_id"])
    op.create_index("ix_report_field_values_project_id", "report_field_values", ["project_id"])
    op.create_index("ix_report_field_values_report_field", "report_field_values", ["report_id", "field_id"])
    op.create_index(
        "uq_report_field_values_selected",
        "report_field_values",
        ["report_id", "field_id"],
        unique=True,
        postgresql_where=sa.text("is_selected"),
    )

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

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON report_fields, reports, report_field_values TO pdf_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON report_fields, reports, report_field_values FROM pdf_app")
    op.drop_table("report_field_values")
    op.drop_table("reports")
    op.drop_table("report_fields")
