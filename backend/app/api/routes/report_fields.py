import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.report_field import ReportField
from app.models.report_field_value import ReportFieldValue
from app.models.user import User
from app.schemas.report_field import AutoGroupRequest, GroupRename, InferredColumn, InferResult, InferTextRequest, ReportFieldBulkCreate, ReportFieldCreate, ReportFieldOut, ReportFieldReorder, ReportFieldUpdate
from app.services import field_inference
from app.services.report_values import (
    NAME_HEADERS,
    URL_HEADERS,
    infer_data_type,
    read_table_rows,
    recompute_selection,
    slugify,
)

router = APIRouter(prefix="/projects/{project_id}/report-fields", tags=["report-fields"])


def _get_field_or_404(db: Session, project_id: uuid.UUID, field_id: uuid.UUID) -> ReportField:
    field = db.execute(
        select(ReportField).where(ReportField.id == field_id, ReportField.project_id == project_id)
    ).scalar_one_or_none()
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return field


def _list(db: Session, project_id: uuid.UUID) -> list[ReportField]:
    return list(
        db.execute(
            select(ReportField)
            .where(ReportField.project_id == project_id)
            .order_by(ReportField.position, ReportField.created_at)
        ).scalars()
    )


@router.get("", response_model=list[ReportFieldOut])
def list_fields(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    return _list(db, project_id)


@router.post("", response_model=ReportFieldOut, status_code=status.HTTP_201_CREATED)
def create_field(
    project_id: uuid.UUID,
    payload: ReportFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    existing_keys = {f.key for f in _list(db, project_id)}
    if payload.key and payload.key.strip():
        key = slugify(payload.key)
        if key in existing_keys:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A field with this key already exists")
    else:
        base = slugify(payload.label)
        key, n = base, 2
        while key in existing_keys:
            key = f"{base}_{n}"
            n += 1
    max_pos = db.execute(
        select(func.max(ReportField.position)).where(ReportField.project_id == project_id)
    ).scalar_one_or_none()
    field = ReportField(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        key=key,
        label=payload.label.strip(),
        data_type=payload.data_type,
        description=payload.description,
        allow_import=payload.allow_import,
        allow_extract=payload.allow_extract,
        auto_select=payload.auto_select,
        group_name=(payload.group_name or "").strip() or None,
        position=(max_pos + 1) if max_pos is not None else 0,
    )
    db.add(field)
    db.flush()
    return field


@router.post("/infer", response_model=InferResult)
def infer_fields(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """读上传的 Excel/CSV 表头，按列名和样本值推断出字段（不写库，只给前端预览）。纯规则推断，不调用任何 AI/外部 API。"""
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload an .xlsx or .csv file")
    try:
        headers, rows = read_table_rows(file.file.read(), filename)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read the file")
    existing = _list(db, project_id)
    existing_labels = {f.label.strip().lower() for f in existing} | {f.key for f in existing}
    columns: list[InferredColumn] = []
    for idx, header in enumerate(headers):
        h = header.strip()
        if not h:
            continue
        samples = [r[idx] for _, r in rows if idx < len(r) and r[idx]][:5]
        low = h.lower()
        kind = "name" if low in NAME_HEADERS else "url" if low in URL_HEADERS else "field"
        key = slugify(h)
        columns.append(
            InferredColumn(
                header=h,
                kind=kind,
                label=h,
                key=key,
                data_type=infer_data_type(h, [r[idx] for _, r in rows[:200] if idx < len(r)]) if kind == "field" else "text",
                samples=samples,
                exists=kind == "field" and (low in existing_labels or key in existing_labels),
            )
        )
    return InferResult(row_count=len(rows), columns=columns)


@router.post("/infer-text", response_model=InferResult)
def infer_fields_from_text(
    project_id: uuid.UUID,
    payload: InferTextRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """从粘贴的散乱文本识别字段：配了 DEEPSEEK_API_KEY 用 DeepSeek，否则按 Tab/逗号规则解析。只预览，不写库。"""
    try:
        if field_inference.llm_available():
            found = field_inference.infer_with_llm(payload.text)
        else:
            found = field_inference.infer_heuristic(payload.text)
    except field_inference.InferenceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if not found:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields could be recognized in the text")
    existing = _list(db, project_id)
    taken = {f.label.strip().lower() for f in existing} | {f.key for f in existing}
    columns = [
        InferredColumn(
            header=f["label"], kind="field", label=f["label"], key=slugify(f["label"]), data_type=f["data_type"],
            samples=f["samples"], description=f["description"], group_name=f.get("group"),
            exists=f["label"].strip().lower() in taken or slugify(f["label"]) in taken,
        )
        for f in found
    ]
    return InferResult(row_count=0, columns=columns)


@router.post("/bulk", response_model=list[ReportFieldOut], status_code=status.HTTP_201_CREATED)
def bulk_create_fields(
    project_id: uuid.UUID,
    payload: ReportFieldBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """批量创建字段；label 或 key 已存在的会被跳过。"""
    existing = _list(db, project_id)
    keys = {f.key for f in existing}
    labels = {f.label.strip().lower() for f in existing}
    pos = max((f.position for f in existing), default=-1) + 1
    created: list[ReportField] = []
    for item in payload.fields:
        label = item.label.strip()
        if label.lower() in labels:
            continue
        base = slugify(item.key or label)
        key, n = base, 2
        while key in keys:
            key = f"{base}_{n}"
            n += 1
        field = ReportField(
            tenant_id=current_user.tenant_id, project_id=project_id, key=key, label=label,
            data_type=item.data_type, description=item.description, allow_import=item.allow_import,
            allow_extract=item.allow_extract, auto_select=item.auto_select, position=pos,
            group_name=(item.group_name or "").strip() or None,
        )
        db.add(field)
        created.append(field)
        keys.add(key)
        labels.add(label.lower())
        pos += 1
    db.flush()
    return created


@router.post("/groups/rename", response_model=list[ReportFieldOut])
def rename_group(
    project_id: uuid.UUID,
    payload: GroupRename,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """重命名分组（new 已存在则合并；new 为空则把该组字段变为未分组）。"""
    new = (payload.new or "").strip() or None
    for f in _list(db, project_id):
        if f.group_name == payload.old:
            f.group_name = new
    db.flush()
    return _list(db, project_id)


@router.post("/auto-group", response_model=list[ReportFieldOut])
def auto_group(
    project_id: uuid.UUID,
    payload: AutoGroupRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """让 DeepSeek 给字段分组（默认只处理还没有分组的字段，已有分组名会被优先复用）。之后可手动改。"""
    fields = _list(db, project_id)
    targets = [f for f in fields if not (payload.only_ungrouped and f.group_name)]
    if not targets:
        return fields
    if not field_inference.llm_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DEEPSEEK_API_KEY is not configured")
    try:
        mapping = field_inference.group_with_llm(
            [{"label": f.label, "description": f.description} for f in targets],
            sorted({f.group_name for f in fields if f.group_name}),
        )
    except field_inference.InferenceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    for f in targets:
        g = (mapping.get(f.label) or "").strip()
        if g:
            f.group_name = g[:255]
    db.flush()
    return fields


@router.post("/reorder", response_model=list[ReportFieldOut])
def reorder_fields(
    project_id: uuid.UUID,
    payload: ReportFieldReorder,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    fields = {f.id: f for f in _list(db, project_id)}
    position = 0
    for fid in payload.ids:
        if fid in fields:
            fields[fid].position = position
            position += 1
    # fields not mentioned keep their relative order after the listed ones
    for f in sorted((f for fid, f in fields.items() if fid not in set(payload.ids)), key=lambda f: f.position):
        f.position = position
        position += 1
    db.flush()
    return _list(db, project_id)


@router.patch("/{field_id}", response_model=ReportFieldOut)
def update_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    payload: ReportFieldUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    field = _get_field_or_404(db, project_id, field_id)
    old_mode = field.auto_select
    for name, value in payload.model_dump(exclude_unset=True).items():
        if name == "group_name":
            value = (value or "").strip() or None
        elif value is None and name != "description":
            continue
        setattr(field, name, value)
    db.flush()
    if field.auto_select != old_mode:
        report_ids = db.execute(
            select(ReportFieldValue.report_id).where(ReportFieldValue.field_id == field.id).distinct()
        ).scalars().all()
        for rid in report_ids:
            recompute_selection(db, rid, field)
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    field = _get_field_or_404(db, project_id, field_id)
    db.execute(delete(ReportFieldValue).where(ReportFieldValue.field_id == field.id))
    db.delete(field)
