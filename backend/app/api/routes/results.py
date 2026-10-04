import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.report_field import ReportField
from app.models.result_version import ResultVersion
from app.models.user import User
from app.schemas.result import (
    ApplyOut,
    MatchedHeader,
    MergeOut,
    MergeRequest,
    MissingField,
    ParentOut,
    SnapshotRequest,
    UnmatchedHeader,
    UploadCommitOut,
    UploadPreviewOut,
    VersionDetailOut,
    VersionOut,
)
from app.services import report_values as rv
from app.services import result_versions as svc

router = APIRouter(prefix="/projects/{project_id}/results", tags=["results"])

SAMPLE_COUNT = 3


# ------------------------------------------------------------------ helpers


def _get_version_or_404(db: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> ResultVersion:
    v = db.execute(
        select(ResultVersion).where(ResultVersion.id == version_id, ResultVersion.project_id == project_id)
    ).scalar_one_or_none()
    if v is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return v


def _version_out(v: ResultVersion, names: dict[uuid.UUID, str]) -> dict:
    return dict(
        id=v.id,
        kind=v.kind,
        label=v.label,
        source_filename=v.source_filename,
        run_id=v.run_id,
        parent_ids=[str(p) for p in (v.parent_ids or [])],
        row_count=v.row_count,
        column_count=len(v.columns or []),
        created_by=v.created_by,
        created_by_name=names.get(v.created_by) if v.created_by else None,
        created_at=v.created_at,
        summary=v.summary,
    )


def _names(db: Session, versions: list[ResultVersion]) -> dict[uuid.UUID, str]:
    ids = {v.created_by for v in versions if v.created_by}
    if not ids:
        return {}
    return {u.id: u.name for u in db.execute(select(User).where(User.id.in_(ids))).scalars()}


def _read_upload(file: UploadFile) -> tuple[str, list[str], list[tuple[int, list[str]]]]:
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload an .xlsx or .csv file")
    try:
        headers, rows = rv.read_table_rows(file.file.read(), filename)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read the file")
    return filename, headers, rows


def _match(headers: list[str], fields: list[ReportField], name_column: str | None) -> dict:
    try:
        m = svc.match_upload_headers(headers, fields, name_column)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if m["name_idx"] is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No report name column found")
    return m


def _cell(cells: list[str], idx: int | None) -> str:
    return cells[idx].strip() if idx is not None and idx < len(cells) else ""


def _load_two(db: Session, project_id: uuid.UUID, payload: MergeRequest):
    if payload.base_id == payload.other_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose two different versions")
    base = _get_version_or_404(db, project_id, payload.base_id)
    other = _get_version_or_404(db, project_id, payload.other_id)
    return base, other, *svc.merge_tables(
        base.columns, svc.load_rows(db, base.id), other.columns, svc.load_rows(db, other.id), payload.on_conflict
    )


# ------------------------------------------------------------------ versions


@router.get("/versions", response_model=list[VersionOut])
def list_versions(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    versions = list(
        db.execute(
            select(ResultVersion)
            .where(ResultVersion.project_id == project_id)
            .order_by(ResultVersion.created_at.desc())
        ).scalars()
    )
    names = _names(db, versions)
    return [VersionOut(**_version_out(v, names)) for v in versions]


@router.post("/versions/snapshot", response_model=VersionOut, status_code=status.HTTP_201_CREATED)
def create_snapshot(
    project_id: uuid.UUID,
    payload: SnapshotRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    columns, rows = svc.current_results(db, project_id)
    label = (payload.label.strip() if payload and payload.label else "") or svc.default_label("Snapshot")
    v = svc.create_version(
        db, tenant_id=current_user.tenant_id, project_id=project_id, kind="snapshot", label=label,
        columns=columns, rows=rows, created_by=current_user.id,
    )
    return VersionOut(**_version_out(v, {current_user.id: current_user.name}))


@router.post("/versions/merge/preview")
def merge_preview(
    project_id: uuid.UUID,
    payload: MergeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    return _load_two(db, project_id, payload)[4]


@router.post("/versions/merge", response_model=MergeOut, status_code=status.HTTP_201_CREATED)
def merge(
    project_id: uuid.UUID,
    payload: MergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    base, other, columns, rows, summary = _load_two(db, project_id, payload)
    label = (payload.label or "").strip() or svc.default_label("Merge")
    v = svc.create_version(
        db, tenant_id=current_user.tenant_id, project_id=project_id, kind="merge", label=label,
        columns=columns, rows=rows, created_by=current_user.id,
        parent_ids=[str(base.id), str(other.id)], summary=summary,
    )
    return MergeOut(version_id=v.id, summary=summary)


@router.get("/versions/{version_id}", response_model=VersionDetailOut)
def get_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    v = _get_version_or_404(db, project_id, version_id)
    parent_uuids = []
    for p in v.parent_ids or []:
        try:
            parent_uuids.append(uuid.UUID(str(p)))
        except ValueError:
            pass
    parents = {}
    if parent_uuids:
        parents = {
            p.id: p
            for p in db.execute(
                select(ResultVersion).where(ResultVersion.id.in_(parent_uuids), ResultVersion.project_id == project_id)
            ).scalars()
        }
    return VersionDetailOut(
        **_version_out(v, _names(db, [v])),
        columns=v.columns or [],
        rows=svc.load_rows(db, v.id),
        parents=[ParentOut(id=parents[p].id, label=parents[p].label) for p in parent_uuids if p in parents],
    )


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    v = _get_version_or_404(db, project_id, version_id)
    db.delete(v)  # rows are removed by ON DELETE CASCADE


@router.post("/versions/{version_id}/apply", response_model=ApplyOut)
def apply_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    v = _get_version_or_404(db, project_id, version_id)
    result = svc.write_rows_to_current(
        db, tenant_id=current_user.tenant_id, project_id=project_id, columns=v.columns or [],
        rows=svc.load_rows(db, v.id), note=f"Applied from version {v.label}", user_id=current_user.id,
    )
    return ApplyOut(
        values_added=result["values_added"],
        reports_created=result["reports_created"],
        skipped_columns=result["skipped_columns"],
    )


# ------------------------------------------------------------------ upload


@router.post("/upload/preview", response_model=UploadPreviewOut)
def upload_preview(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    name_column: str | None = Form(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    filename, headers, rows = _read_upload(file)
    fields = svc.list_fields(db, project_id)
    m = _match(headers, fields, name_column)
    matched_keys = {f.key for f in m["matched"].values()}
    unmatched = []
    for i in m["unmatched"]:
        values = [_cell(cells, i) for _, cells in rows]
        non_empty = [v for v in values if v]
        header = headers[i].strip()
        unmatched.append(
            UnmatchedHeader(
                header=header,
                suggested_label=header,
                suggested_type=rv.infer_data_type(header, non_empty[:50]),
                samples=list(dict.fromkeys(non_empty))[:SAMPLE_COUNT],
            )
        )
    return UploadPreviewOut(
        filename=filename,
        row_count=len(rows),
        name_column=headers[m["name_idx"]].strip(),
        url_column=headers[m["url_idx"]].strip() if m["url_idx"] is not None else None,
        matched=[
            MatchedHeader(header=headers[i].strip(), field_key=f.key, field_label=f.label)
            for i, f in m["matched"].items()
        ],
        unmatched=unmatched,
        missing_fields=[
            MissingField(key=f.key, label=f.label, group_name=f.group_name)
            for f in fields
            if f.key not in matched_keys
        ],
    )


@router.post("/upload/commit", response_model=UploadCommitOut)
def upload_commit(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    options: str = Form(default="{}"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    try:
        opts = json.loads(options or "{}")
        if not isinstance(opts, dict):
            raise ValueError
        mappings = opts.get("mappings") or {}
        if not isinstance(mappings, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid options JSON")
    apply_to_current = bool(opts.get("apply_to_current", True))

    filename, headers, rows = _read_upload(file)
    fields = svc.list_fields(db, project_id)
    m = _match(headers, fields, opts.get("name_column"))
    fields_by_key = {f.key: f for f in fields}
    taken = set(fields_by_key)
    next_pos = max([f.position for f in fields], default=-1) + 1

    # Decide, per column index, which field (existing or new) it feeds.
    col_field: dict[int, ReportField] = {}
    skipped_headers: list[str] = []
    fields_created = 0
    mapping_by_lower = {str(k).strip().lower(): v for k, v in mappings.items()}
    for i, header in enumerate(headers):
        h = header.strip()
        if not h or i in (m["name_idx"], m["url_idx"]):
            continue
        spec = mapping_by_lower.get(h.lower())
        if spec is None:
            spec = {"action": "map", "field_key": m["matched"][i].key} if i in m["matched"] else {"action": "skip"}
        action = spec.get("action") if isinstance(spec, dict) else None
        if action == "map":
            field = fields_by_key.get(spec.get("field_key"))
            if field is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=f'Unknown field for column "{h}"'
                )
            col_field[i] = field
        elif action == "create":
            label = str(spec.get("label") or h).strip()
            if not label:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Empty label for column "{h}"')
            existing = next((f for f in fields_by_key.values() if f.label.strip().lower() == label.lower()), None)
            if existing is not None:  # same label already exists: reuse instead of creating a duplicate
                col_field[i] = existing
                continue
            key = svc.unique_key(label, taken)
            taken.add(key)
            field = ReportField(
                tenant_id=current_user.tenant_id,
                project_id=project_id,
                key=key,
                label=label[:255],
                data_type=svc.normalize_data_type(spec.get("data_type")),
                group_name=(str(spec["group_name"]).strip() or None) if spec.get("group_name") else None,
                position=next_pos,
            )
            next_pos += 1
            db.add(field)
            db.flush()
            fields_by_key[key] = field
            col_field[i] = field
            fields_created += 1
        elif action == "skip":
            skipped_headers.append(h)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Invalid mapping for column "{h}"')

    # Build version rows (later duplicates of the same report name win cell by cell).
    ordered: dict[str, dict] = {}
    for _, cells in rows:
        name = _cell(cells, m["name_idx"])
        if not name:
            continue
        entry = ordered.setdefault(svc._row_key(name), {"report_name": name, "report_id": None, "data": {}})
        for i, field in col_field.items():
            val = _cell(cells, i)
            if val:
                entry["data"][field.key] = val
    version_rows = list(ordered.values())
    used_fields = list(dict.fromkeys(f.key for f in col_field.values()))
    columns = [svc.column_dict(fields_by_key[k]) for k in sorted(used_fields, key=lambda k: fields_by_key[k].position)]

    counts = {"values_added": 0, "reports_created": 0, "reports_updated": 0}
    if apply_to_current:
        counts = svc.write_rows_to_current(
            db, tenant_id=current_user.tenant_id, project_id=project_id, columns=columns, rows=version_rows,
            note=f"Upload: {filename}", user_id=current_user.id,
        )
    for r in version_rows:
        report = rv.find_report(db, project_id, r["report_name"])
        r["report_id"] = report.id if report else None

    matched_keys = {f.key for f in col_field.values()}
    summary = {
        "filename": filename,
        "fields_created": fields_created,
        "reports_created": counts["reports_created"],
        "reports_updated": counts["reports_updated"],
        "values_added": counts["values_added"],
        "skipped_columns": skipped_headers,
        "missing_fields": [f.label for f in fields if f.key not in matched_keys],
        "applied_to_current": apply_to_current,
    }
    label = str(opts.get("label") or "").strip() or f"Upload {filename}"
    v = svc.create_version(
        db, tenant_id=current_user.tenant_id, project_id=project_id, kind="upload", label=label,
        columns=columns, rows=version_rows, created_by=current_user.id, source_filename=filename, summary=summary,
    )
    return UploadCommitOut(
        version_id=v.id,
        fields_created=fields_created,
        reports_created=counts["reports_created"],
        reports_updated=counts["reports_updated"],
        values_added=counts["values_added"],
        rows=len(version_rows),
    )
