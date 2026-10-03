import uuid
from datetime import datetime

from pydantic import BaseModel


class FileInfo(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NodeRunOut(BaseModel):
    id: uuid.UUID
    node_id: uuid.UUID
    node_name: str
    order_index: int
    status: str
    duration_ms: int | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    output_files: list[FileInfo]


class NodeRunDetail(NodeRunOut):
    logs: str | None
    input_files: list[FileInfo]


class WorkflowRunSummary(BaseModel):
    id: uuid.UUID
    status: str
    triggered_by: uuid.UUID
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class WorkflowRunDetail(WorkflowRunSummary):
    error_message: str | None
    input_files: list[FileInfo]
    node_runs: list[NodeRunOut]
