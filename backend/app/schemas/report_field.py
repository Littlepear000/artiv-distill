import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DataType = Literal["text", "number", "percent", "date", "year"]
AutoSelect = Literal["latest", "system_first"]


class ReportFieldCreate(BaseModel):
    key: str | None = None
    label: str = Field(min_length=1, max_length=255)
    data_type: DataType = "text"
    description: str | None = None
    allow_import: bool = True
    allow_extract: bool = True
    auto_select: AutoSelect = "system_first"
    group_name: str | None = Field(default=None, max_length=255)


class ReportFieldUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    data_type: DataType | None = None
    description: str | None = None
    allow_import: bool | None = None
    allow_extract: bool | None = None
    auto_select: AutoSelect | None = None
    group_name: str | None = Field(default=None, max_length=255)


class ReportFieldReorder(BaseModel):
    ids: list[uuid.UUID]


class ReportFieldOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    key: str
    label: str
    data_type: str
    description: str | None
    allow_import: bool
    allow_extract: bool
    auto_select: str
    group_name: str | None = None
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InferredColumn(BaseModel):
    header: str
    kind: Literal["name", "url", "field"]
    label: str
    key: str
    data_type: DataType
    samples: list[str]
    exists: bool
    description: str | None = None
    group_name: str | None = None


class InferResult(BaseModel):
    row_count: int
    columns: list[InferredColumn]


class ReportFieldBulkCreate(BaseModel):
    fields: list[ReportFieldCreate]


class InferTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=60000)


class GroupRename(BaseModel):
    old: str = Field(min_length=1, max_length=255)
    new: str | None = Field(default=None, max_length=255)  # 空 = 取消分组


class AutoGroupRequest(BaseModel):
    only_ungrouped: bool = True
