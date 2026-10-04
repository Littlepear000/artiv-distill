import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.api.resource_guards import get_workflow_or_404
from app.database import get_db
from app.models.file_record import FileRecord, FileSource
from app.models.node_run import NodeRun
from app.models.project_member import ProjectRole
from app.models.user import User
from app.models.workflow_node import WorkflowNode
from app.models.workflow_run import RunStatus, WorkflowRun
from app.schemas.run import FileInfo, NodeRunOut, WorkflowRunDetail, WorkflowRunSummary
from app.storage import build_storage_key, download_bytes, upload_bytes
from app.tasks import execute_workflow_run

router = APIRouter(prefix="/projects/{project_id}/workflows/{workflow_id}/runs", tags=["workflow-runs"])


@router.get("", response_model=list[WorkflowRunSummary])
def list_runs(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    get_workflow_or_404(db, project_id, workflow_id)
    return (
        db.execute(select(WorkflowRun).where(WorkflowRun.workflow_id == workflow_id).order_by(WorkflowRun.created_at.desc()))
        .scalars()
        .all()
    )


@router.post("", response_model=WorkflowRunSummary, status_code=status.HTTP_201_CREATED)
def create_run(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    """上传 PDF 文件并触发一次工作流运行：持久化保存后立即入队异步执行，不阻塞请求。"""
    get_workflow_or_404(db, project_id, workflow_id)

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one PDF file is required")
    for upload in files:
        if not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{upload.filename} is not a PDF file")

    run = WorkflowRun(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        workflow_id=workflow_id,
        status=RunStatus.PENDING,
        triggered_by=current_user.id,
    )

    db.add(run)
    db.flush()  # 必须先让 workflow_runs 行存在，files 表才能引用它的外键

    input_file_ids: list[str] = []
    for upload in files:
        data = upload.file.read()
        key = build_storage_key(current_user.tenant_id, project_id, "runs", str(run.id), "input", upload.filename)
        upload_bytes(key, data, content_type=upload.content_type or "application/pdf")
        record = FileRecord(
            tenant_id=current_user.tenant_id,
            project_id=project_id,
            workflow_run_id=run.id,
            storage_key=key,
            original_filename=upload.filename,
            content_type=upload.content_type or "application/pdf",
            size_bytes=len(data),
            source=FileSource.UPLOAD,
        )
        db.add(record)
        db.flush()
        input_file_ids.append(str(record.id))

    run.input_file_ids = input_file_ids
    db.flush()

    execute_workflow_run.delay(str(run.id), str(current_user.tenant_id))
    return run


def _to_file_info(record: FileRecord) -> FileInfo:
    return FileInfo.model_validate(record)


@router.get("/{run_id}", response_model=WorkflowRunDetail)
def get_run(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    get_workflow_or_404(db, project_id, workflow_id)
    run = db.execute(
        select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.workflow_id == workflow_id)
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    input_files = [
        _to_file_info(f)
        for f in db.execute(select(FileRecord).where(FileRecord.id.in_([uuid.UUID(i) for i in run.input_file_ids]))).scalars()
    ]

    node_runs_raw = (
        db.execute(select(NodeRun).where(NodeRun.workflow_run_id == run.id).order_by(NodeRun.order_index))
        .scalars()
        .all()
    )
    node_names = {
        n.id: n.name
        for n in db.execute(select(WorkflowNode).where(WorkflowNode.workflow_id == workflow_id)).scalars()
    }

    node_runs = []
    for nr in node_runs_raw:
        output_files = [
            _to_file_info(f)
            for f in db.execute(
                select(FileRecord).where(FileRecord.id.in_([uuid.UUID(i) for i in nr.output_file_ids]))
            ).scalars()
        ]
        node_runs.append(
            NodeRunOut(
                id=nr.id,
                node_id=nr.node_id,
                node_name=node_names.get(nr.node_id, "(deleted node)"),
                order_index=nr.order_index,
                status=nr.status.value,
                duration_ms=nr.duration_ms,
                error_message=nr.error_message,
                started_at=nr.started_at,
                finished_at=nr.finished_at,
                output_files=output_files,
            )
        )

    return WorkflowRunDetail(
        id=run.id,
        status=run.status.value,
        triggered_by=run.triggered_by,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error_message=run.error_message,
        input_files=input_files,
        node_runs=node_runs,
    )


@router.get("/{run_id}/files/{file_id}/download")
def download_run_file(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    run_id: uuid.UUID,
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    get_workflow_or_404(db, project_id, workflow_id)
    run = db.execute(
        select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.workflow_id == workflow_id)
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    record = db.execute(
        select(FileRecord).where(FileRecord.id == file_id, FileRecord.workflow_run_id == run_id)
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    data = download_bytes(record.storage_key)
    return StreamingResponse(
        iter([data]),
        media_type=record.content_type,
        headers={"Content-Disposition": f'attachment; filename="{record.original_filename}"'},
    )
