"""Result versions: pure merge / header-matching logic plus DB helpers to record and apply versions."""
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.report import Report
from app.models.report_field import FIELD_DATA_TYPES, ReportField
from app.models.report_field_value import ReportFieldValue
from app.models.result_version import ResultVersion
from app.models.result_version_row import ResultVersionRow
from app.services import report_values as rv

MAX_EXAMPLES = 20
NAME_HEADERS = set(rv.NAME_HEADERS) | {"report", "report_name", "报告", "报告名称", "名称"}


# ------------------------------------------------------------------ pure logic


def column_dict(field: Any) -> dict:
    return {
        "key": field.key,
        "label": field.label,
        "group_name": field.group_name,
        "data_type": field.data_type,
    }


def _is_empty(v: Any) -> bool:
    return v is None or str(v).strip() == ""


def _row_key(name: str) -> str:
    return rv.normalize_report_name(name) or (name or "").strip().lower()


def match_upload_headers(headers: list[str], fields: list[Any], name_column: str | None = None) -> dict:
    """Match file headers to existing result fields (by lowercase label or key; allow_import ignored).

    Returns {name_idx, url_idx, matched: {idx: field}, unmatched: [idx]}. Raises ValueError if the
    explicitly given name_column is not among the headers."""
    by_label = {f.label.strip().lower(): f for f in fields}
    by_key = {f.key.lower(): f for f in fields}
    name_idx = url_idx = None
    if name_column is not None and name_column.strip():
        wanted = name_column.strip().lower()
        for i, h in enumerate(headers):
            if (h or "").strip().lower() == wanted:
                name_idx = i
                break
        if name_idx is None:
            raise ValueError("Name column not found in file")
    matched: dict[int, Any] = {}
    unmatched: list[int] = []
    for i, header in enumerate(headers):
        h = (header or "").strip().lower()
        if not h or i == name_idx:
            continue
        if name_idx is None and name_column is None and h in NAME_HEADERS:
            name_idx = i
            continue
        if url_idx is None and h in rv.URL_HEADERS:
            url_idx = i
            continue
        field = by_label.get(h) or by_key.get(h)
        if field is not None:
            matched[i] = field
        else:
            unmatched.append(i)
    return {"name_idx": name_idx, "url_idx": url_idx, "matched": matched, "unmatched": unmatched}


def merge_tables(
    base_cols: list[dict],
    base_rows: list[dict],
    other_cols: list[dict],
    other_rows: list[dict],
    on_conflict: str = "other",
) -> tuple[list[dict], list[dict], dict]:
    """Merge two result tables. Rows are {report_name, report_id, data}. Returns (columns, rows, summary)."""
    if on_conflict not in ("other", "base"):
        raise ValueError("on_conflict must be 'other' or 'base'")
    base_keys = [c["key"] for c in base_cols]
    other_keys = {c["key"] for c in other_cols}
    both = [k for k in base_keys if k in other_keys]
    only_base_cols = [c for c in base_cols if c["key"] not in other_keys]
    only_other_cols = [c for c in other_cols if c["key"] not in set(base_keys)]
    columns = [dict(c) for c in base_cols] + [dict(c) for c in only_other_cols]
    labels = {c["key"]: c["label"] for c in columns}

    other_by_key: dict[str, dict] = {}
    for r in other_rows:
        other_by_key[_row_key(r["report_name"])] = r
    base_seen: set[str] = set()
    rows: list[dict] = []
    matched = only_base = 0
    conflict_cells = conflict_rows = 0
    examples: list[dict] = []
    for r in base_rows:
        k = _row_key(r["report_name"])
        o = other_by_key.get(k) if k not in base_seen else None
        base_seen.add(k)
        data = {key: v for key, v in (r.get("data") or {}).items() if not _is_empty(v)}
        report_id = r.get("report_id")
        if o is None:
            only_base += 1
            rows.append({"report_name": r["report_name"], "report_id": report_id, "data": data})
            continue
        matched += 1
        odata = {key: v for key, v in (o.get("data") or {}).items() if not _is_empty(v)}
        row_conflict = False
        for key, ov in odata.items():
            bv = data.get(key)
            if bv is None:
                data[key] = ov
            elif bv != ov:
                row_conflict = True
                conflict_cells += 1
                if len(examples) < MAX_EXAMPLES:
                    examples.append(
                        {
                            "report_name": r["report_name"],
                            "field_label": labels.get(key, key),
                            "base_value": bv,
                            "other_value": ov,
                        }
                    )
                if on_conflict == "other":
                    data[key] = ov
        conflict_rows += 1 if row_conflict else 0
        rows.append({"report_name": r["report_name"], "report_id": report_id or o.get("report_id"), "data": data})
    only_other = 0
    emitted: set[str] = set()
    for r in other_rows:
        k = _row_key(r["report_name"])
        if k in base_seen or k in emitted:
            continue
        emitted.add(k)
        only_other += 1
        data = {key: v for key, v in (r.get("data") or {}).items() if not _is_empty(v)}
        rows.append({"report_name": r["report_name"], "report_id": r.get("report_id"), "data": data})

    summary = {
        "on_conflict": on_conflict,
        "columns": {
            "base": len(base_cols),
            "other": len(other_cols),
            "merged": len(columns),
            "duplicate": len(both),
            "only_base": [c["label"] for c in only_base_cols],
            "only_other": [c["label"] for c in only_other_cols],
        },
        "rows": {
            "base": len(base_seen),
            "other": len(other_by_key),
            "merged": len(rows),
            "matched": matched,
            "only_base": only_base,
            "only_other": only_other,
        },
        "conflicts": {"cells": conflict_cells, "rows": conflict_rows, "examples": examples},
    }
    return columns, rows, summary


# ------------------------------------------------------------------ DB helpers


def default_label(prefix: str) -> str:
    return f"{prefix} {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"


def create_version(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    kind: str,
    label: str,
    columns: list[dict],
    rows: list[dict],
    created_by: uuid.UUID | None,
    source_filename: str | None = None,
    run_id: uuid.UUID | None = None,
    parent_ids: list[str] | None = None,
    summary: dict | None = None,
) -> ResultVersion:
    version = ResultVersion(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        kind=kind,
        label=label,
        source_filename=source_filename,
        run_id=run_id,
        parent_ids=parent_ids or [],
        columns=columns,
        row_count=len(rows),
        summary=summary,
        created_by=created_by,
        created_at=rv.next_timestamp(),
    )
    db.add(version)
    db.flush()
    db.add_all(
        ResultVersionRow(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            version_id=version.id,
            report_name=r["report_name"],
            report_id=r.get("report_id"),
            data=r.get("data") or {},
            position=i,
        )
        for i, r in enumerate(rows)
    )
    db.flush()
    return version


def load_rows(db: Session, version_id: uuid.UUID) -> list[dict]:
    return [
        {"report_name": r.report_name, "report_id": r.report_id, "data": r.data or {}}
        for r in db.execute(
            select(ResultVersionRow).where(ResultVersionRow.version_id == version_id).order_by(ResultVersionRow.position)
        ).scalars()
    ]


def record_run_version(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    fields: dict[str, ReportField],
    touched: list[tuple[Report, dict[str, str]]],
    run_id: uuid.UUID | None,
    created_by: uuid.UUID | None,
) -> ResultVersion:
    keys = {k for _, data in touched for k in data}
    columns = [column_dict(f) for f in sorted(fields.values(), key=lambda f: (f.position, f.key)) if f.key in keys]
    rows = [{"report_name": rep.name, "report_id": rep.id, "data": data} for rep, data in touched]
    return create_version(
        db, tenant_id=tenant_id, project_id=project_id, kind="run", label=default_label("Run"),
        columns=columns, rows=rows, created_by=created_by, run_id=run_id,
    )


def list_fields(db: Session, project_id: uuid.UUID) -> list[ReportField]:
    return list(
        db.execute(
            select(ReportField)
            .where(ReportField.project_id == project_id)
            .order_by(ReportField.position, ReportField.created_at)
        ).scalars()
    )


def current_results(db: Session, project_id: uuid.UUID) -> tuple[list[dict], list[dict]]:
    fields = list_fields(db, project_id)
    key_by_id = {f.id: f.key for f in fields}
    reports = list(db.execute(select(Report).where(Report.project_id == project_id).order_by(Report.name)).scalars())
    values: dict[uuid.UUID, dict[str, str]] = {}
    for v in db.execute(
        select(ReportFieldValue).where(
            ReportFieldValue.project_id == project_id, ReportFieldValue.is_selected.is_(True)
        )
    ).scalars():
        key = key_by_id.get(v.field_id)
        if key is not None:
            values.setdefault(v.report_id, {})[key] = v.value
    rows = [{"report_name": r.name, "report_id": r.id, "data": values.get(r.id, {})} for r in reports]
    return [column_dict(f) for f in fields], rows


def add_value_skip_duplicate(
    db: Session, *, tenant_id: uuid.UUID, report: Report, field: ReportField, value: str,
    note: str, created_by: uuid.UUID | None,
) -> bool:
    """Append an excel_import value unless an identical excel_import value already exists."""
    dup = db.execute(
        select(ReportFieldValue.id).where(
            ReportFieldValue.report_id == report.id,
            ReportFieldValue.field_id == field.id,
            ReportFieldValue.source == "excel_import",
            ReportFieldValue.value == value,
        )
    ).first()
    if dup is not None:
        return False
    rv.add_value(
        db, tenant_id=tenant_id, report=report, field=field, value=value,
        source="excel_import", note=note, created_by=created_by,
    )
    return True


def get_or_create_report(
    db: Session, *, tenant_id: uuid.UUID, project_id: uuid.UUID, name: str, created_by: uuid.UUID,
    report_id: uuid.UUID | None = None,
) -> tuple[Report, bool]:
    report = None
    if report_id is not None:
        report = db.execute(
            select(Report).where(Report.id == report_id, Report.project_id == project_id)
        ).scalar_one_or_none()
    if report is None:
        report = rv.find_report(db, project_id, name)
    if report is not None:
        return report, False
    report = Report(
        id=uuid.uuid4(), tenant_id=tenant_id, project_id=project_id, name=name.strip(), uploaded_by=created_by
    )
    db.add(report)
    db.flush()
    return report, True


def write_rows_to_current(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
    columns: list[dict],
    rows: list[dict],
    note: str,
    user_id: uuid.UUID,
) -> dict:
    """Write version-style rows into the current results. Returns counts + skipped column keys."""
    fields = {f.key: f for f in list_fields(db, project_id)}
    usable = [c["key"] for c in columns if c["key"] in fields]
    skipped = [c["key"] for c in columns if c["key"] not in fields]
    added = created = updated = 0
    for row in rows:
        name = (row.get("report_name") or "").strip()
        if not name:
            continue
        data = row.get("data") or {}
        report, was_created = get_or_create_report(
            db, tenant_id=tenant_id, project_id=project_id, name=name, created_by=user_id,
            report_id=row.get("report_id"),
        )
        created += 1 if was_created else 0
        row_added = 0
        for key in usable:
            val = data.get(key)
            if _is_empty(val):
                continue
            if add_value_skip_duplicate(
                db, tenant_id=tenant_id, report=report, field=fields[key], value=str(val).strip(),
                note=note, created_by=user_id,
            ):
                row_added += 1
        added += row_added
        if row_added and not was_created:
            updated += 1
    return {"values_added": added, "reports_created": created, "reports_updated": updated, "skipped_columns": skipped}


def unique_key(label: str, taken: set[str]) -> str:
    base = rv.slugify(label)
    key, n = base, 2
    while key in taken:
        key = f"{base}_{n}"
        n += 1
    return key


def normalize_data_type(value: str | None) -> str:
    return value if value in FIELD_DATA_TYPES else "text"
