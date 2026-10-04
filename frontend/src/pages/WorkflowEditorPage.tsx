import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";
import WorkflowDiagramView from "../components/WorkflowDiagramView";
import WorkflowFormEditor from "../components/WorkflowFormEditor";

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
  position: { x: number; y: number };
  code_asset_id: string | null;
  code_asset_version: number | null;
  prompt_asset_id: string | null;
  prompt_asset_version: number | null;
}

interface WorkflowDetail {
  id: string;
  name: string;
}

interface RunSummary {
  id: string;
  status: "pending" | "running" | "success" | "failed";
}

interface FileInfo {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
}

interface RunNodeStatus {
  node_id: string;
  status: "pending" | "running" | "success" | "failed";
  output_files: FileInfo[];
}

interface RunDetail {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  input_files: FileInfo[];
  node_runs: RunNodeStatus[];
}

type Tab = "edit" | "diagram";

export default function WorkflowEditorPage() {
  const { t } = useI18n();
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("edit");
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [siblingWorkflows, setSiblingWorkflows] = useState<WorkflowDetail[]>([]);
  const [nodes, setNodes] = useState<WorkflowNodeData[]>([]);
  const [latestRun, setLatestRun] = useState<RunDetail | null>(null);

  const basePath = `/projects/${projectId}/workflows/${workflowId}`;

  async function loadLatestRun() {
    const listRes = await apiClient.get<RunSummary[]>(`${basePath}/runs`);
    if (listRes.data.length === 0) {
      setLatestRun(null);
      return;
    }
    const detailRes = await apiClient.get<RunDetail>(`${basePath}/runs/${listRes.data[0].id}`);
    setLatestRun(detailRes.data);
  }

  async function loadAll() {
    const [workflowRes, nodesRes, siblingsRes] = await Promise.all([
      apiClient.get<WorkflowDetail>(basePath),
      apiClient.get<WorkflowNodeData[]>(`${basePath}/nodes`),
      apiClient.get<WorkflowDetail[]>(`/projects/${projectId}/workflows`),
    ]);
    setWorkflow(workflowRes.data);
    setNodes(nodesRes.data.sort((a, b) => a.order_index - b.order_index));
    setSiblingWorkflows(siblingsRes.data);
    await loadLatestRun();
  }

  useEffect(() => {
    setTab("edit");
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowId]);

  // 不管在「编辑」还是「流程图」tab，都轻量轮询一次最新运行状态，这样状态点在任务跑着的时候会动起来
  useEffect(() => {
    const timer = setInterval(loadLatestRun, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowId]);

  async function handleSwitchWorkflow(newWorkflowId: string) {
    navigate(`/projects/${projectId}/workflows/${newWorkflowId}`);
  }

  async function handleCreateWorkflow() {
    const name = window.prompt(t("New workflow name"), t("New workflow"));
    if (!name) return;
    const response = await apiClient.post<WorkflowDetail>(`/projects/${projectId}/workflows`, { name });
    navigate(`/projects/${projectId}/workflows/${response.data.id}`);
  }

  async function handleDownload(fileId: string, filename: string) {
    const response = await apiClient.get(`${basePath}/runs/${latestRun?.id}/files/${fileId}/download`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title text-lg">{workflow?.name}</h1>
          {siblingWorkflows.length > 1 && (
            <select
              value={workflowId}
              onChange={(e) => handleSwitchWorkflow(e.target.value)}
              className="select-chevron rounded border border-gray-300 py-1.5 pl-2 text-sm"
            >
              {siblingWorkflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleCreateWorkflow}
            className="whitespace-nowrap rounded border border-gray-300 px-2 py-1.5 text-sm hover:bg-gray-50"
            title={t("New workflow")}
          >
            ＋ {t("New workflow")}
          </button>
        </div>
        <Link
          to={`${basePath}/runs`}
          className="whitespace-nowrap rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          {t("History")}
        </Link>
      </div>

      <div className="flex gap-1 border-b border-gray-200 bg-white px-6">
        <button
          onClick={() => setTab("edit")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            tab === "edit" ? "border-slate-800 font-medium text-slate-800" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("Edit")}
        </button>
        <button
          onClick={() => setTab("diagram")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            tab === "diagram" ? "border-slate-800 font-medium text-slate-800" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("Diagram")}
        </button>
      </div>

      {tab === "edit" ? (
        // 编辑表单就是普通文档流内容，交给最外层 <main overflow-auto> 原生滚动即可——
        // 不额外套 flex-1/overflow-hidden，避免嵌套高度链算错导致卷不动（历史上踩过这个坑）
        <WorkflowFormEditor
          basePath={basePath}
          projectId={projectId!}
          nodes={nodes}
          latestRun={latestRun}
          onReload={loadAll}
          onDownload={handleDownload}
        />
      ) : (
        // 流程图里的 React Flow 画布必须有明确的像素高度才能正常渲染，这里才需要 flex-1 撑满剩余空间
        <div className="flex-1 overflow-hidden">
          <WorkflowDiagramView
            basePath={basePath}
            projectId={projectId!}
            nodes={nodes}
            latestRun={latestRun}
            onDownload={handleDownload}
          />
        </div>
      )}
    </div>
  );
}
