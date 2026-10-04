import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AssetKind(str, enum.Enum):
    CODE = "code"
    PROMPT = "prompt"


class WorkflowAsset(Base):
    """项目级可复用的 Code / Prompt 素材库条目。

    节点的 Code/Prompt 仍然是节点自己的文本字段（执行引擎不变）；从素材库
    "选用"某个素材，只是把它当前版本的内容拷贝进节点的 Code/Prompt —— 和"上传文件"
    是同一种语义，只是来源换成了库里已保存的素材，而不是本地文件。
    """

    __tablename__ = "workflow_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    kind: Mapped[AssetKind] = mapped_column(
        Enum(AssetKind, name="asset_kind", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
