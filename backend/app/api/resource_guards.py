"""嵌套资源归属校验的公共小工具。

require_project_role 只校验用户在 URL 的 project_id 上的角色，不校验 URL 里更深层的
workflow_id / node_id 是否真的属于这个项目 —— 这里补上这一层，防止同一租户内
跨项目的越权访问（IDOR）。
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.models.workflow_node import WorkflowNode


def get_workflow_or_404(db: Session, project_id: uuid.UUID, workflow_id: uuid.UUID) -> Workflow:
    workflow = db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.project_id == project_id)
    ).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


def get_node_or_404(db: Session, workflow_id: uuid.UUID, node_id: uuid.UUID) -> WorkflowNode:
    node = db.execute(
        select(WorkflowNode).where(WorkflowNode.id == node_id, WorkflowNode.workflow_id == workflow_id)
    ).scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return node
