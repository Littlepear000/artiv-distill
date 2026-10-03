import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactFlow, { Background, Controls, Edge, Node, NodeMouseHandler, OnNodesChange, applyNodeChanges } from "reactflow";
import "reactflow/dist/style.css";
import apiClient from "../api/client";
import WorkflowNodeCard, { WorkflowNodeCardData } from "../components/WorkflowNodeCard";

interface NodePosition {
  x: number;
  y: number;
}

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
  position: NodePosition;
}

interface WorkflowDetail {
  id: string;
  name: string;
}

interface NodeVersion {
  id: string;
  version_no: number;
  code_snapshot: string;
  prompt_snapshot: string;
  saved_at: string;
}

const nodeTypes = { workflowNode: WorkflowNodeCard };

export default function WorkflowEditorPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [nodes, setNodes] = useState<WorkflowNodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [versions, setVersions] = useState<NodeVersion[] | null>(null);

  const basePath = `/projects/${projectId}/workflows/${workflowId}`;

  async function loadAll() {
    const [workflowRes, nodesRes] = await Promise.all([
      apiClient.get<WorkflowDetail>(basePath),
      apiClient.get<WorkflowNodeData[]>(`${basePath}/nodes`),
    ]);
    setWorkflow(workflowRes.data);
    setNodes(nodesRes.data.sort((a, b) => a.order_index - b.order_index));
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowId]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (selectedNode) {
      setEditName(selectedNode.name);
      setEditCode(selectedNode.code);
      setEditPrompt(selectedNode.prompt);
      setVersions(null);
    }
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flowNodes: Node<WorkflowNodeCardData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "workflowNode",
        position: n.position,
        data: { label: n.name, order: n.order_index, selected: n.id === selectedNodeId },
      })),
    [nodes, selectedNodeId]
  );

  const flowEdges: Edge[] = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.order_index - b.order_index);
    const edges: Edge[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push({ id: `${sorted[i].id}-${sorted[i + 1].id}`, source: sorted[i].id, target: sorted[i + 1].id });
    }
    return edges;
  }, [nodes]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((current) => {
      const asFlowNodes = current.map((n) => ({ id: n.id, position: n.position } as Node));
      const updated = applyNodeChanges(changes, asFlowNodes);
      return current.map((n) => {
        const match = updated.find((u) => u.id === n.id);
        return match ? { ...n, position: match.position } : n;
      });
    });
  }, []);

  async function handleNodeDragStop(_: unknown, node: Node) {
    await apiClient.patch(`${basePath}/nodes/${node.id}`, { position: node.position });
  }

  const handleNodeClick: NodeMouseHandler = (_, node) => setSelectedNodeId(node.id);

  async function handleAddNode() {
    const response = await apiClient.post<WorkflowNodeData>(`${basePath}/nodes`, {
      name: `新节点 ${nodes.length + 1}`,
      code: "",
      prompt: "",
      position: { x: nodes.length * 220 + 40, y: 120 },
    });
    await loadAll();
    setSelectedNodeId(response.data.id);
  }

  async function handleSaveNode() {
    if (!selectedNode) return;
    await apiClient.patch(`${basePath}/nodes/${selectedNode.id}`, {
      name: editName,
      code: editCode,
      prompt: editPrompt,
    });
    await loadAll();
  }

  async function handleDeleteNode() {
    if (!selectedNode) return;
    await apiClient.delete(`${basePath}/nodes/${selectedNode.id}`);
    setSelectedNodeId(null);
    await loadAll();
  }

  async function handleMove(direction: -1 | 1) {
    if (!selectedNode) return;
    const sorted = [...nodes].sort((a, b) => a.order_index - b.order_index);
    const index = sorted.findIndex((n) => n.id === selectedNode.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    [sorted[index], sorted[swapWith]] = [sorted[swapWith], sorted[index]];
    await apiClient.post(`${basePath}/nodes/reorder`, { node_ids: sorted.map((n) => n.id) });
    await loadAll();
  }

  async function loadVersions() {
    if (!selectedNode) return;
    const response = await apiClient.get<NodeVersion[]>(`${basePath}/nodes/${selectedNode.id}/versions`);
    setVersions(response.data);
  }

  async function handleRestore(versionId: string) {
    if (!selectedNode) return;
    await apiClient.post(`${basePath}/nodes/${selectedNode.id}/versions/${versionId}/restore`);
    await loadAll();
    await loadVersions();
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div>
          <Link to={`/projects/${projectId}/workflows`} className="text-sm text-slate-600 underline">
            ← 返回工作流列表
          </Link>
          <h1 className="text-lg font-semibold">{workflow?.name}</h1>
        </div>
        <button onClick={handleAddNode} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
          + 添加节点
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={handleNodeClick}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="flex w-[420px] flex-col gap-4 overflow-y-auto border-l border-gray-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">节点名称</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Code（处理逻辑代码）</label>
              <div className="overflow-hidden rounded border border-gray-300">
                <Editor
                  height="240px"
                  language="python"
                  value={editCode}
                  onChange={(value) => setEditCode(value ?? "")}
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Prompt（AI 提示词）</label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={6}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="例如：请总结本节点输入文本的核心要点……"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSaveNode} className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700">
                保存
              </button>
              <button onClick={() => handleMove(-1)} className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                ← 前移
              </button>
              <button onClick={() => handleMove(1)} className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                后移 →
              </button>
              <button onClick={handleDeleteNode} className="rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                删除
              </button>
            </div>

            <div className="border-t border-gray-100 pt-3">
              {versions === null ? (
                <button onClick={loadVersions} className="text-sm text-slate-600 underline">
                  查看版本历史
                </button>
              ) : (
                <div>
                  <div className="mb-2 text-sm font-medium text-gray-700">版本历史</div>
                  {versions.length === 0 && <p className="text-sm text-gray-400">暂无历史版本</p>}
                  <ul className="flex flex-col gap-2">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
                        <span>
                          v{v.version_no} · {new Date(v.saved_at).toLocaleString()}
                        </span>
                        <button onClick={() => handleRestore(v.id)} className="text-slate-800 underline">
                          恢复此版本
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
