import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.api.resource_guards import get_node_or_404, get_workflow_or_404
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.user import User
from app.models.workflow_node import WorkflowNode
from app.models.workflow_node_version import WorkflowNodeVersion
from app.schemas.workflow_node import NodeCreate, NodeOut, NodeReorderRequest, NodeUpdate, NodeVersionOut

router = APIRouter(prefix="/projects/{project_id}/workflows/{workflow_id}/nodes", tags=["workflow-nodes"])
_get_workflow_or_404 = get_workflow_or_404
_get_node_or_404 = get_node_or_404


@router.get("", response_model=list[NodeOut])
def list_nodes(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    return db.execute(
        select(WorkflowNode).where(WorkflowNode.workflow_id == workflow_id).order_by(WorkflowNode.order_index)
    ).scalars().all()


@router.post("", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
def create_node(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    payload: NodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    _get_workflow_or_404(db, project_id, workflow_id)

    next_order = db.execute(
        select(func.coalesce(func.max(WorkflowNode.order_index), -1)).where(WorkflowNode.workflow_id == workflow_id)
    ).scalar_one() + 1

    node = WorkflowNode(
        tenant_id=current_user.tenant_id,
        workflow_id=workflow_id,
        name=payload.name,
        code=payload.code,
        prompt=payload.prompt,
        order_index=next_order,
        position=payload.position.model_dump(),
    )
    db.add(node)
    db.flush()
    return node


@router.patch("/{node_id}", response_model=NodeOut)
def update_node(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    node_id: uuid.UUID,
    payload: NodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    node = _get_node_or_404(db, workflow_id, node_id)

    updates = payload.model_dump(exclude_unset=True)

    # Code 或 Prompt 发生变化时，先把变更前的内容存一份快照，支持回滚
    code_changed = "code" in updates and updates["code"] != node.code
    prompt_changed = "prompt" in updates and updates["prompt"] != node.prompt
    if code_changed or prompt_changed:
        next_version_no = db.execute(
            select(func.coalesce(func.max(WorkflowNodeVersion.version_no), 0)).where(
                WorkflowNodeVersion.node_id == node_id
            )
        ).scalar_one() + 1
        db.add(
            WorkflowNodeVersion(
                tenant_id=current_user.tenant_id,
                node_id=node.id,
                version_no=next_version_no,
                code_snapshot=node.code,
                prompt_snapshot=node.prompt,
                saved_by=current_user.id,
            )
        )

    if "position" in updates:
        updates["position"] = updates["position"].model_dump() if updates["position"] is not None else node.position
    for field, value in updates.items():
        setattr(node, field, value)
    db.flush()
    return node


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    node_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    node = _get_node_or_404(db, workflow_id, node_id)
    db.delete(node)


@router.post("/reorder", response_model=list[NodeOut])
def reorder_nodes(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    payload: NodeReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    nodes = db.execute(select(WorkflowNode).where(WorkflowNode.workflow_id == workflow_id)).scalars().all()
    nodes_by_id = {n.id: n for n in nodes}

    if set(payload.node_ids) != set(nodes_by_id.keys()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="节点列表与工作流当前节点不一致")

    for index, node_id in enumerate(payload.node_ids):
        nodes_by_id[node_id].order_index = index
    db.flush()
    return sorted(nodes, key=lambda n: n.order_index)


@router.get("/{node_id}/versions", response_model=list[NodeVersionOut])
def list_node_versions(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    node_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    _get_node_or_404(db, workflow_id, node_id)
    return db.execute(
        select(WorkflowNodeVersion)
        .where(WorkflowNodeVersion.node_id == node_id)
        .order_by(WorkflowNodeVersion.version_no.desc())
    ).scalars().all()


@router.post("/{node_id}/versions/{version_id}/restore", response_model=NodeOut)
def restore_node_version(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    node_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    _get_workflow_or_404(db, project_id, workflow_id)
    node = _get_node_or_404(db, workflow_id, node_id)

    version = db.execute(
        select(WorkflowNodeVersion).where(
            WorkflowNodeVersion.id == version_id, WorkflowNodeVersion.node_id == node_id
        )
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")

    # 回滚前先把"回滚前的当前状态"也存一份快照，这样回滚本身也是可撤销的
    next_version_no = db.execute(
        select(func.coalesce(func.max(WorkflowNodeVersion.version_no), 0)).where(
            WorkflowNodeVersion.node_id == node_id
        )
    ).scalar_one() + 1
    db.add(
        WorkflowNodeVersion(
            tenant_id=current_user.tenant_id,
            node_id=node.id,
            version_no=next_version_no,
            code_snapshot=node.code,
            prompt_snapshot=node.prompt,
            saved_by=current_user.id,
        )
    )

    node.code = version.code_snapshot
    node.prompt = version.prompt_snapshot
    db.flush()
    return node
