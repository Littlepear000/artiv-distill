import json
import mimetypes
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.celery_app import celery_app
from app.database import tenant_scoped_session
from app.models.file_record import FileRecord, FileSource
from app.models.node_run import NodeRun
from app.models.workflow_node import WorkflowNode
from app.models.workflow_run import RunStatus, WorkflowRun
from app.services.report_values import ingest_parse_results
from app.sandbox import SandboxExecutionError, run_node_sandbox
from app.storage import build_storage_key, download_bytes, upload_bytes


REPORT_RESULTS_FILENAME = "report_results.json"


def _ingest_report_results(db, tenant_uuid: uuid.UUID, run: WorkflowRun, files: dict[str, bytes]) -> str | None:
    """Ingest report_results.json produced by a node. Never raises; returns a log line or None."""
    data = files.get(REPORT_RESULTS_FILENAME)
    if data is None:
        return None
    try:
        payload = json.loads(data.decode("utf-8"))
        items = payload["items"]
        if not isinstance(items, list):
            raise ValueError('"items" must be a list')
        with db.begin_nested():
            result = ingest_parse_results(
                db,
                tenant_id=tenant_uuid,
                project_id=run.project_id,
                items=items,
                note="workflow run",
                run_id=run.id,
                created_by=None,
            )
        return (
            f"[report_results] {result['values_added']} value(s) added; "
            f"unknown reports: {result['unknown_reports']}; unknown fields: {result['unknown_fields']}"
        )
    except Exception as exc:  # must never fail the run
        return f"[report_results] Failed to ingest {REPORT_RESULTS_FILENAME}: {exc}"


@celery_app.task(name="app.tasks.execute_workflow_run")
def execute_workflow_run(run_id: str, tenant_id: str) -> None:
    run_uuid = uuid.UUID(run_id)
    tenant_uuid = uuid.UUID(tenant_id)

    with tenant_scoped_session(tenant_uuid) as db:
        run = db.get(WorkflowRun, run_uuid)
        if run is None:
            return

        run.status = RunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        db.flush()

        nodes = (
            db.execute(
                select(WorkflowNode)
                .where(WorkflowNode.workflow_id == run.workflow_id)
                .order_by(WorkflowNode.order_index)
            )
            .scalars()
            .all()
        )

        current_file_ids: list[str] = list(run.input_file_ids)
        current_files: dict[str, bytes] = {}
        for file_id in current_file_ids:
            record = db.get(FileRecord, uuid.UUID(file_id))
            current_files[record.original_filename] = download_bytes(record.storage_key)

        run_failed = False
        for node in nodes:
            node_run = NodeRun(
                tenant_id=tenant_uuid,
                workflow_run_id=run.id,
                node_id=node.id,
                order_index=node.order_index,
                status=RunStatus.RUNNING,
                input_file_ids=current_file_ids,
                started_at=datetime.now(timezone.utc),
            )
            db.add(node_run)
            db.flush()

            start = time.monotonic()
            try:
                output_files, logs = run_node_sandbox(node.code, node.prompt, current_files)
            except SandboxExecutionError as exc:
                node_run.status = RunStatus.FAILED
                node_run.error_message = str(exc)[:8000]
                node_run.duration_ms = int((time.monotonic() - start) * 1000)
                node_run.finished_at = datetime.now(timezone.utc)
                db.flush()
                run_failed = True
                break

            output_file_ids: list[str] = []
            next_files: dict[str, bytes] = {}
            for name, data in output_files.items():
                key = build_storage_key(tenant_uuid, run.project_id, "runs", str(run.id), "nodes", str(node.id), name)
                content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
                upload_bytes(key, data, content_type=content_type)
                record = FileRecord(
                    tenant_id=tenant_uuid,
                    project_id=run.project_id,
                    workflow_run_id=run.id,
                    node_run_id=node_run.id,
                    storage_key=key,
                    original_filename=name,
                    content_type=content_type,
                    size_bytes=len(data),
                    source=FileSource.NODE_OUTPUT,
                )
                db.add(record)
                db.flush()
                output_file_ids.append(str(record.id))
                next_files[name] = data

            ingest_note = _ingest_report_results(db, tenant_uuid, run, next_files)
            if ingest_note:
                logs = f"{logs or ''}\n{ingest_note}"

            node_run.status = RunStatus.SUCCESS
            node_run.output_file_ids = output_file_ids
            node_run.logs = logs[-20000:] if logs else logs
            node_run.duration_ms = int((time.monotonic() - start) * 1000)
            node_run.finished_at = datetime.now(timezone.utc)
            db.flush()

            current_file_ids = output_file_ids
            current_files = next_files

        run.status = RunStatus.FAILED if run_failed else RunStatus.SUCCESS
        run.finished_at = datetime.now(timezone.utc)
        db.flush()
