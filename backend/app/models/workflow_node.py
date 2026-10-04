import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # 记录这个节点的 Code/Prompt 是从素材库哪个素材、哪个版本"选用"进来的（拷贝语义，非实时引用）——
    # 仅用于在表单/流程图上显示来源，节点实际执行永远读 code/prompt 这两个字段本身
    code_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_assets.id", ondelete="SET NULL"), nullable=True
    )
    code_asset_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_assets.id", ondelete="SET NULL"), nullable=True
    )
    prompt_asset_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default='{"x": 0, "y": 0}')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
