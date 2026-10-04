import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

FIELD_DATA_TYPES = ("text", "number", "percent", "date", "year")
AUTO_SELECT_MODES = ("latest", "system_first")


class ReportField(Base):
    """Project-level definition of a parsed field that every report can hold values for."""

    __tablename__ = "report_fields"
    __table_args__ = (UniqueConstraint("project_id", "key", name="uq_report_field_project_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="text", default="text")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    allow_import: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    allow_extract: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    auto_select: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="system_first", default="system_first"
    )
    group_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
