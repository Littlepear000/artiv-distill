import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    source_url: str | None = None


class ReportUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=500)
    source_url: str | None = None


class SelectedValueOut(BaseModel):
    value_id: uuid.UUID
    value: str
    source: str
    created_at: datetime
    is_pinned: bool
    history_count: int


class ReportOut(BaseModel):
    id: uuid.UUID
    name: str
    source_url: str | None
    has_file: bool
    uploaded_by: uuid.UUID
    uploader_name: str | None
    created_at: datetime
    updated_at: datetime
    values: dict[str, SelectedValueOut]


class ReportListOut(BaseModel):
    items: list[ReportOut]
    total: int


class ValueCreate(BaseModel):
    value: str = Field(min_length=1)
    note: str | None = None
    select: bool = False


class SelectValue(BaseModel):
    value_id: uuid.UUID


class ValueOut(BaseModel):
    id: uuid.UUID
    value: str
    source: str
    note: str | None
    run_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_by_name: str | None
    created_at: datetime
    is_selected: bool
    is_pinned: bool


class ReportValueOut(ValueOut):
    field_id: uuid.UUID
    field_key: str


class FileUrlOut(BaseModel):
    url: str


class SkippedRow(BaseModel):
    row: int
    reason: str


class ImportResult(BaseModel):
    created: int
    updated: int
    values_added: int
    values_skipped_duplicate: int
    skipped_rows: list[SkippedRow]
    unknown_columns: list[str]


class MatchOssRequest(BaseModel):
    prefix: str
    bucket: str | None = None
    overwrite: bool = False
    dry_run: bool = True


class MatchedItem(BaseModel):
    report_id: uuid.UUID
    report_name: str
    key: str


class AmbiguousItem(BaseModel):
    report_name: str
    keys: list[str]


class MatchOssResult(BaseModel):
    matched: list[MatchedItem]
    ambiguous: list[AmbiguousItem]
    unmatched_reports: list[str]
    unmatched_objects: list[str]
    applied: bool


class ParseItem(BaseModel):
    report_id: uuid.UUID | None = None
    report_name: str | None = None
    fields: dict[str, str | int | float | None]


class ParseResultsRequest(BaseModel):
    items: list[ParseItem]
    note: str | None = None


class ParseResultsOut(BaseModel):
    values_added: int
    unknown_reports: list[str]
    unknown_fields: list[str]
