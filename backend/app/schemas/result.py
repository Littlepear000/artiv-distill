import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ColumnOut(BaseModel):
    key: str
    label: str
    group_name: str | None = None
    data_type: str = "text"


class VersionOut(BaseModel):
    id: uuid.UUID
    kind: str
    label: str
    source_filename: str | None = None
    run_id: uuid.UUID | None = None
    parent_ids: list[str] = []
    row_count: int
    column_count: int
    created_by: uuid.UUID | None = None
    created_by_name: str | None = None
    created_at: datetime
    summary: dict[str, Any] | None = None


class VersionRowOut(BaseModel):
    report_name: str
    report_id: uuid.UUID | None = None
    data: dict[str, str]


class ParentOut(BaseModel):
    id: uuid.UUID
    label: str


class VersionDetailOut(VersionOut):
    columns: list[ColumnOut]
    rows: list[VersionRowOut]
    parents: list[ParentOut]


class SnapshotRequest(BaseModel):
    label: str | None = Field(default=None, max_length=500)


class MatchedHeader(BaseModel):
    header: str
    field_key: str
    field_label: str


class UnmatchedHeader(BaseModel):
    header: str
    suggested_label: str
    suggested_type: str
    samples: list[str]


class MissingField(BaseModel):
    key: str
    label: str
    group_name: str | None = None


class UploadPreviewOut(BaseModel):
    filename: str
    row_count: int
    name_column: str | None
    url_column: str | None
    matched: list[MatchedHeader]
    unmatched: list[UnmatchedHeader]
    missing_fields: list[MissingField]


class UploadCommitOut(BaseModel):
    version_id: uuid.UUID
    fields_created: int
    reports_created: int
    reports_updated: int
    values_added: int
    rows: int


class MergeRequest(BaseModel):
    base_id: uuid.UUID
    other_id: uuid.UUID
    on_conflict: Literal["other", "base"] = "other"
    label: str | None = Field(default=None, max_length=500)


class MergeOut(BaseModel):
    version_id: uuid.UUID
    summary: dict[str, Any]


class ApplyOut(BaseModel):
    values_added: int
    reports_created: int
    skipped_columns: list[str]
