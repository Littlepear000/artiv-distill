import os
import uuid

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.config import settings
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.report import Report
from app.models.report_field import ReportField
from app.models.report_field_value import ReportFieldValue
from app.models.user import User
from app.schemas.report import (
    AmbiguousItem,
    FileUrlOut,
    ImportResult,
    MatchedItem,
    MatchOssRequest,
    MatchOssResult,
    ParseResultsOut,
    ParseResultsRequest,
    ReportCreate,
    ReportListOut,
    ReportOut,
    ReportUpdate,
    ReportValueOut,
    SelectedValueOut,
    SelectValue,
    SkippedRow,
    ValueCreate,
    ValueOut,
)
from app.services import report_ingest as ri
from app.services import report_values as rv
from app.storage import build_storage_key, get_s3_client, list_object_keys, presigned_download_url, upload_bytes

router = APIRouter(prefix="/projects/{project_id}/reports", tags=["reports"])

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ------------------------------------------------------------------ helpers


def _get_report_or_404(db: Session, project_id: uuid.UUID, report_id: uuid.UUID) -> Report:
    report = db.execute(
        select(Report).where(Report.id == report_id, Report.project_id == project_id)
    ).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


def _get_field_or_404(db: Session, project_id: uuid.UUID, field_id: uuid.UUID) -> ReportField:
    field = db.execute(
        select(ReportField).where(ReportField.id == field_id, ReportField.project_id == project_id)
    ).scalar_one_or_none()
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return field


def _name_taken(db: Session, project_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None) -> bool:
    stmt = select(Report.id).where(Report.project_id == project_id, Report.name == name)
    if exclude is not None:
        stmt = stmt.where(Report.id != exclude)
    return db.execute(stmt).first() is not None


def _build_report_outs(db: Session, project_id: uuid.UUID, reports: list[Report]) -> list[ReportOut]:
    if not reports:
        return []
    ids = [r.id for r in reports]
    keys = {f.id: f.key for f in db.execute(select(ReportField).where(ReportField.project_id == project_id)).scalars()}
    counts = {
        (rid, fid): c
        for rid, fid, c in db.execute(
            select(ReportFieldValue.report_id, ReportFieldValue.field_id, func.count())
            .where(ReportFieldValue.report_id.in_(ids))
            .group_by(ReportFieldValue.report_id, ReportFieldValue.field_id)
        ).all()
    }
    selected: dict[uuid.UUID, dict[str, SelectedValueOut]] = {rid: {} for rid in ids}
    for v in db.execute(
        select(ReportFieldValue).where(ReportFieldValue.report_id.in_(ids), ReportFieldValue.is_selected.is_(True))
    ).scalars():
        key = keys.get(v.field_id)
        if key is None:
            continue
        selected[v.report_id][key] = SelectedValueOut(
            value_id=v.id,
            value=v.value,
            source=v.source,
            created_at=v.created_at,
            is_pinned=v.is_pinned,
            history_count=counts.get((v.report_id, v.field_id), 1),
        )
    names = {
        u.id: u.name
        for u in db.execute(select(User).where(User.id.in_({r.uploaded_by for r in reports}))).scalars()
    }
    return [
        ReportOut(
            id=r.id,
            name=r.name,
            source_url=r.source_url,
            has_file=bool(r.storage_key),
            uploaded_by=r.uploaded_by,
            uploader_name=names.get(r.uploaded_by),
            created_at=r.created_at,
            updated_at=r.updated_at,
            values=selected[r.id],
        )
        for r in reports
    ]


def _value_out(v: ReportFieldValue, names: dict[uuid.UUID, str]) -> dict:
    return dict(
        id=v.id,
        value=v.value,
        source=v.source,
        note=v.note,
        run_id=v.run_id,
        created_by=v.created_by,
        created_by_name=names.get(v.created_by) if v.created_by else None,
        created_at=v.created_at,
        is_selected=v.is_selected,
        is_pinned=v.is_pinned,
    )


def _user_names(db: Session, rows: list[ReportFieldValue]) -> dict[uuid.UUID, str]:
    ids = {v.created_by for v in rows if v.created_by}
    if not ids:
        return {}
    return {u.id: u.name for u in db.execute(select(User).where(User.id.in_(ids))).scalars()}


def _has_link_clause():
    return or_(
        and_(Report.source_url.is_not(None), Report.source_url != ""),
        Report.storage_key.is_not(None),
    )


def _bucket_and_key(report: Report) -> tuple[str | None, str]:
    url = report.source_url or ""
    if url.startswith("s3://"):
        rest = url[len("s3://"):]
        if "/" in rest:
            bucket, _ = rest.split("/", 1)
            return bucket, report.storage_key
    return None, report.storage_key


# ------------------------------------------------- static routes (before {report_id})


@router.get("/import-template")
def import_template(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    fields = list(
        db.execute(
            select(ReportField).where(ReportField.project_id == project_id).order_by(ReportField.position)
        ).scalars()
    )
    return Response(
        content=rv.build_template_workbook(fields),
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="report-import-template.xlsx"'},
    )


@router.post("/import", response_model=ImportResult)
def import_reports(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    if not (file.filename or "").lower().endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload an .xlsx or .csv file")
    data = file.file.read()
    try:
        headers, rows = rv.read_table_rows(data, file.filename or "")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read the file")

    fields = list(db.execute(select(ReportField).where(ReportField.project_id == project_id)).scalars())
    layout = rv.map_headers(headers, fields)
    if layout.name_col is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail='The first sheet must have a "name" column'
        )

    created = updated = added = skipped_dup = 0
    skipped: list[SkippedRow] = []
    for row_no, cells in rows:
        def cell(i: int | None) -> str:
            return cells[i].strip() if i is not None and i < len(cells) else ""

        name = cell(layout.name_col)
        if not name:
            skipped.append(SkippedRow(row=row_no, reason="Missing report name"))
            continue
        url = cell(layout.url_col)
        report = db.execute(
            select(Report).where(Report.project_id == project_id, Report.name == name)
        ).scalar_one_or_none()
        if report is None:
            report = Report(
                id=uuid.uuid4(),
                tenant_id=current_user.tenant_id,
                project_id=project_id,
                name=name,
                source_url=url or None,
                uploaded_by=current_user.id,
            )
            db.add(report)
            db.flush()
            created += 1
        else:
            if url:
                report.source_url = url
            rv.touch_report(report)
            updated += 1
        for idx, field in layout.field_cols.items():
            val = cell(idx)
            if not val:
                continue
            dup = db.execute(
                select(ReportFieldValue.id).where(
                    ReportFieldValue.report_id == report.id,
                    ReportFieldValue.field_id == field.id,
                    ReportFieldValue.source == "excel_import",
                    ReportFieldValue.value == val,
                )
            ).first()
            if dup is not None:
                skipped_dup += 1
                continue
            rv.add_value(
                db, tenant_id=current_user.tenant_id, report=report, field=field, value=val,
                source="excel_import", note="Excel import", created_by=current_user.id,
            )
            added += 1
    return ImportResult(
        created=created,
        updated=updated,
        values_added=added,
        values_skipped_duplicate=skipped_dup,
        skipped_rows=skipped,
        unknown_columns=layout.unknown_columns,
    )


class IngestItem(BaseModel):
    name: str
    action: str


class UploadFilesOut(BaseModel):
    created: int
    overridden: int
    skipped_non_pdf: int
    skipped_empty: int = 0
    items: list[IngestItem]


class UploadLinksRequest(BaseModel):
    text: str


class InvalidLinkLine(BaseModel):
    line: int
    text: str
    reason: str


class UploadLinksOut(BaseModel):
    created: int
    overridden: int
    invalid: list[InvalidLinkLine]
    items: list[IngestItem]


def _delete_object_quietly(key: str) -> None:
    try:
        get_s3_client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).warning("Could not delete old object %s", key)


@router.post("/upload-files", response_model=UploadFilesOut)
def upload_files(
    project_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    existing = {
        r.name: r for r in db.execute(select(Report).where(Report.project_id == project_id)).scalars()
    }
    created = overridden = skipped = skipped_empty = 0
    items: list[IngestItem] = []
    for f in files:
        name = ri.name_from_filename(f.filename or "")
        if name is None:
            skipped += 1
            continue
        data = f.file.read()
        if not data:
            skipped_empty += 1
            continue
        report = existing.get(name)
        is_new = report is None
        if is_new:
            report = Report(
                id=uuid.uuid4(), tenant_id=current_user.tenant_id, project_id=project_id,
                name=name, uploaded_by=current_user.id,
            )
            db.add(report)
            db.flush()
            existing[name] = report
        key = build_storage_key(current_user.tenant_id, project_id, "reports", str(report.id), ri.basename(f.filename or ""))
        try:
            upload_bytes(key, data, content_type=f.content_type or "application/pdf")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not store file: {exc}")
        old_key = report.storage_key
        report.storage_key = key
        report.source_url = f"s3://{settings.s3_bucket}/{key}"
        rv.touch_report(report)
        db.flush()
        own_prefix = build_storage_key(current_user.tenant_id, project_id, "reports", str(report.id)) + "/"
        if not is_new and old_key and old_key != key and old_key.startswith(own_prefix):
            _delete_object_quietly(old_key)
        if is_new:
            created += 1
        else:
            overridden += 1
        items.append(IngestItem(name=name, action="created" if is_new else "overridden"))
    return UploadFilesOut(
        created=created, overridden=overridden, skipped_non_pdf=skipped, skipped_empty=skipped_empty, items=items
    )


@router.post("/upload-links", response_model=UploadLinksOut)
def upload_links(
    project_id: uuid.UUID,
    payload: UploadLinksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    entries, invalid = ri.parse_link_lines(payload.text)
    # duplicates inside the request: last wins
    last: dict[str, ri.LineEntry] = {e.name: e for e in entries}
    existing = {
        r.name: r for r in db.execute(select(Report).where(Report.project_id == project_id)).scalars()
    }
    created = overridden = 0
    items: list[IngestItem] = []
    for name, entry in last.items():
        key = ri.own_bucket_key(entry.url, settings.s3_bucket, settings.s3_endpoint_url)
        report = existing.get(name)
        if report is None:
            report = Report(
                id=uuid.uuid4(), tenant_id=current_user.tenant_id, project_id=project_id,
                name=name, uploaded_by=current_user.id, source_url=entry.url, storage_key=key,
            )
            db.add(report)
            created += 1
            items.append(IngestItem(name=name, action="created"))
        else:
            report.source_url = entry.url
            report.storage_key = key
            rv.touch_report(report)
            overridden += 1
            items.append(IngestItem(name=name, action="overridden"))
    db.flush()
    return UploadLinksOut(
        created=created,
        overridden=overridden,
        invalid=[InvalidLinkLine(line=i.line, text=i.text, reason=i.reason) for i in invalid],
        items=items,
    )


@router.post("/match-oss", response_model=MatchOssResult)
def match_oss(
    project_id: uuid.UUID,
    payload: MatchOssRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    bucket = payload.bucket or settings.s3_bucket
    try:
        keys = list_object_keys(payload.prefix, bucket)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not list storage objects: {exc}")

    stmt = select(Report).where(Report.project_id == project_id)
    if not payload.overwrite:
        stmt = stmt.where(~_has_link_clause())
    reports = {str(r.id): r for r in db.execute(stmt.order_by(Report.name)).scalars()}
    matched, ambiguous, unmatched, unmatched_keys = rv.match_names_to_keys(
        {rid: r.name for rid, r in reports.items()}, keys
    )
    applied = False
    if not payload.dry_run:
        for rid, key in matched.items():
            r = reports[rid]
            r.storage_key = key
            r.source_url = f"s3://{bucket}/{key}"
            rv.touch_report(r)
        db.flush()
        applied = True
    return MatchOssResult(
        matched=[MatchedItem(report_id=reports[rid].id, report_name=reports[rid].name, key=k) for rid, k in matched.items()],
        ambiguous=[AmbiguousItem(report_name=reports[rid].name, keys=ks) for rid, ks in ambiguous.items()],
        unmatched_reports=[reports[rid].name for rid in unmatched],
        unmatched_objects=unmatched_keys,
        applied=applied,
    )


@router.post("/parse-results", response_model=ParseResultsOut)
def parse_results(
    project_id: uuid.UUID,
    payload: ParseResultsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    result = rv.ingest_parse_results(
        db,
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        items=[i.model_dump() for i in payload.items],
        note=payload.note,
        created_by=current_user.id,
    )
    return ParseResultsOut(**result)


# ---------------------------------------------------------------- CRUD


@router.get("", response_model=ReportListOut)
def list_reports(
    project_id: uuid.UUID,
    search: str | None = Query(default=None),
    has_link: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    conds = [Report.project_id == project_id]
    if search and search.strip():
        pattern = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conds.append(Report.name.ilike(pattern, escape="\\"))
    if has_link is True:
        conds.append(_has_link_clause())
    elif has_link is False:
        conds.append(~_has_link_clause())
    total = db.execute(select(func.count()).select_from(Report).where(*conds)).scalar_one()
    reports = list(
        db.execute(
            select(Report)
            .where(*conds)
            .order_by(Report.created_at.desc(), Report.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars()
    )
    return ReportListOut(items=_build_report_outs(db, project_id, reports), total=total)


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    project_id: uuid.UUID,
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Report name cannot be empty")
    if _name_taken(db, project_id, name):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A report with this name already exists")
    report = Report(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        name=name,
        source_url=(payload.source_url or "").strip() or None,
        uploaded_by=current_user.id,
    )
    db.add(report)
    db.flush()
    db.refresh(report)
    return _build_report_outs(db, project_id, [report])[0]


@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    report = _get_report_or_404(db, project_id, report_id)
    return _build_report_outs(db, project_id, [report])[0]


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name") is not None:
        name = data["name"].strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Report name cannot be empty")
        if _name_taken(db, project_id, name, exclude=report.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A report with this name already exists")
        report.name = name
    if "source_url" in data:
        report.source_url = (data["source_url"] or "").strip() or None
    rv.touch_report(report)
    db.flush()
    return _build_report_outs(db, project_id, [report])[0]


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    db.execute(delete(ReportFieldValue).where(ReportFieldValue.report_id == report.id))
    db.delete(report)


@router.post("/{report_id}/file", response_model=ReportOut)
def upload_report_file(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    filename = os.path.basename(file.filename or "") or "report.pdf"
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is empty")
    key = build_storage_key(current_user.tenant_id, project_id, "reports", str(report.id), filename)
    upload_bytes(key, data, content_type=file.content_type or "application/octet-stream")
    report.storage_key = key
    if not report.source_url:
        report.source_url = f"s3://{settings.s3_bucket}/{key}"
    rv.touch_report(report)
    db.flush()
    return _build_report_outs(db, project_id, [report])[0]


@router.get("/{report_id}/file-url", response_model=FileUrlOut)
def report_file_url(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    report = _get_report_or_404(db, project_id, report_id)
    if not report.storage_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This report has no file")
    bucket, key = _bucket_and_key(report)
    return FileUrlOut(url=presigned_download_url(key, bucket))


# ---------------------------------------------------------------- values


@router.get("/{report_id}/values", response_model=list[ReportValueOut])
def list_report_values(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    _get_report_or_404(db, project_id, report_id)
    keys = {f.id: f.key for f in db.execute(select(ReportField).where(ReportField.project_id == project_id)).scalars()}
    rows = list(
        db.execute(
            select(ReportFieldValue)
            .where(ReportFieldValue.report_id == report_id)
            .order_by(ReportFieldValue.created_at.desc())
        ).scalars()
    )
    names = _user_names(db, rows)
    return [
        ReportValueOut(**_value_out(v, names), field_id=v.field_id, field_key=keys.get(v.field_id, ""))
        for v in rows
        if v.field_id in keys
    ]


@router.get("/{report_id}/fields/{field_id}/values", response_model=list[ValueOut])
def list_field_values(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    _get_report_or_404(db, project_id, report_id)
    _get_field_or_404(db, project_id, field_id)
    rows = list(
        db.execute(
            select(ReportFieldValue)
            .where(ReportFieldValue.report_id == report_id, ReportFieldValue.field_id == field_id)
            .order_by(ReportFieldValue.created_at.desc())
        ).scalars()
    )
    names = _user_names(db, rows)
    return [ValueOut(**_value_out(v, names)) for v in rows]


def _pin(db: Session, report_id: uuid.UUID, field_id: uuid.UUID, target: ReportFieldValue) -> None:
    for other in db.execute(
        select(ReportFieldValue).where(
            ReportFieldValue.report_id == report_id,
            ReportFieldValue.field_id == field_id,
            ReportFieldValue.is_selected.is_(True),
            ReportFieldValue.id != target.id,
        )
    ).scalars():
        other.is_selected = False
        other.is_pinned = False
    db.flush()
    target.is_selected = True
    target.is_pinned = True
    db.flush()


@router.post("/{report_id}/fields/{field_id}/values", response_model=ValueOut, status_code=status.HTTP_201_CREATED)
def add_manual_value(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    field_id: uuid.UUID,
    payload: ValueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    field = _get_field_or_404(db, project_id, field_id)
    row = rv.add_value(
        db, tenant_id=current_user.tenant_id, report=report, field=field, value=payload.value.strip(),
        source="manual", note=payload.note, created_by=current_user.id, recompute=not payload.select,
    )
    if payload.select:
        _pin(db, report.id, field.id, row)
    return ValueOut(**_value_out(row, {current_user.id: current_user.name}))


@router.put("/{report_id}/fields/{field_id}/selected", response_model=ValueOut)
def pin_value(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    field_id: uuid.UUID,
    payload: SelectValue,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    _get_field_or_404(db, project_id, field_id)
    row = db.execute(
        select(ReportFieldValue).where(
            ReportFieldValue.id == payload.value_id,
            ReportFieldValue.report_id == report_id,
            ReportFieldValue.field_id == field_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Value not found")
    _pin(db, report_id, field_id, row)
    rv.touch_report(report)
    return ValueOut(**_value_out(row, _user_names(db, [row])))


@router.delete("/{report_id}/fields/{field_id}/selected", status_code=status.HTTP_204_NO_CONTENT)
def unpin_value(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    field = _get_field_or_404(db, project_id, field_id)
    current = db.execute(
        select(ReportFieldValue).where(
            ReportFieldValue.report_id == report_id,
            ReportFieldValue.field_id == field_id,
            ReportFieldValue.is_selected.is_(True),
        )
    ).scalar_one_or_none()
    if current is not None and current.is_pinned:
        current.is_pinned = False
        db.flush()
    rv.recompute_selection(db, report_id, field)
    rv.touch_report(report)


@router.delete("/{report_id}/values/{value_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_value(
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    value_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    report = _get_report_or_404(db, project_id, report_id)
    row = db.execute(
        select(ReportFieldValue).where(ReportFieldValue.id == value_id, ReportFieldValue.report_id == report_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Value not found")
    field = db.get(ReportField, row.field_id)
    db.delete(row)
    db.flush()
    if field is not None:
        rv.recompute_selection(db, report_id, field)
    rv.touch_report(report)
