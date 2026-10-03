import Editor from "@monaco-editor/react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { deriveFileBadge } from "./WorkflowNodeCard";

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
}

interface FileInfo {
  id: string;
  original_filename: string;
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

interface NodeVersion {
  id: string;
  version_no: number;
  code_snapshot: string;
  prompt_snapshot: string;
  saved_at: string;
}

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500",
  success: "bg-green-500",
  failed: "bg-red-500",
};

interface Props {
  basePath: string;
  nodes: WorkflowNodeData[];
  latestRun: RunDetail | null;
  onReload: () => Promise<void>;
  onDownload: (fileId: string, filename: string) => void;
}

/**
 * 工作流的「编辑」tab：表单/输入框形式配置节点，不用画布拖拽。
 * 可视化展示挪到了单独的「流程图」tab（WorkflowDiagramView），这里只管编辑。
 */
export default function WorkflowFormEditor({ basePath, nodes, latestRun, onReload, onDownload }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [versions, setVersions] = useState<NodeVersion[] | null>(null);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.order_index - b.order_index), [nodes]);
  const expandedNode = sortedNodes.find((n) => n.id === expandedId) ?? null;
  const isDirty = expandedNode
    ? editName !== expandedNode.name || editCode !== expandedNode.code || editPrompt !== expandedNode.prompt
    : false;

  useEffect(() => {
    if (expandedNode) {
      setEditName(expandedNode.name);
      setEditCode(expandedNode.code);
      setEditPrompt(expandedNode.prompt);
      setVersions(null);
    }
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 关标签页/刷新/浏览器返回这类离开页面的操作，浏览器层面也拦一下，不止是站内切换节点
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function runStatusFor(nodeId: string): RunNodeStatus | undefined {
    return latestRun?.node_runs.find((nr) => nr.node_id === nodeId);
  }

  function toggleExpand(nodeId: string) {
    if (isDirty) {
      const confirmed = window.confirm("当前节点有未保存的修改（比如刚上传的代码），现在离开会丢失——确定吗？");
      if (!confirmed) return;
    }
    setExpandedId((current) => (current === nodeId ? null : nodeId));
  }

  async function handleAddNode() {
    await apiClient.post(`${basePath}/nodes`, {
      name: `新节点 ${nodes.length + 1}`,
      code: "",
      prompt: "",
      position: { x: nodes.length * 220 + 40, y: 120 },
    });
    await onReload();
  }

  async function handleSaveNode() {
    if (!expandedNode) return;
    await apiClient.patch(`${basePath}/nodes/${expandedNode.id}`, {
      name: editName,
      code: editCode,
      prompt: editPrompt,
    });
    await onReload();
  }

  async function handleDeleteNode() {
    if (!expandedNode) return;
    await apiClient.delete(`${basePath}/nodes/${expandedNode.id}`);
    setExpandedId(null);
    await onReload();
  }

  async function handleMove(direction: -1 | 1) {
    if (!expandedNode) return;
    const index = sortedNodes.findIndex((n) => n.id === expandedNode.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= sortedNodes.length) return;
    const reordered = [...sortedNodes];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await apiClient.post(`${basePath}/nodes/reorder`, { node_ids: reordered.map((n) => n.id) });
    await onReload();
  }

  async function loadVersions() {
    if (!expandedNode) return;
    const response = await apiClient.get<NodeVersion[]>(`${basePath}/nodes/${expandedNode.id}/versions`);
    setVersions(response.data);
  }

  async function handleRestore(versionId: string) {
    if (!expandedNode) return;
    await apiClient.post(`${basePath}/nodes/${expandedNode.id}/versions/${versionId}/restore`);
    await onReload();
    await loadVersions();
  }

  async function handleCodeFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setEditCode(text);
    e.target.value = ""; // 允许连续两次选同一个文件也能触发 onChange
  }

  async function handlePromptFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setEditPrompt(text);
    e.target.value = "";
  }

  function handleUploadFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setUploadFiles(e.target.files);
  }

  async function handleUploadAndRun() {
    if (!uploadFiles || uploadFiles.length === 0 || nodes.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(uploadFiles).forEach((file) => formData.append("files", file));
      await apiClient.post(`${basePath}/runs`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadFiles(null);
      await onReload();
    } catch {
      setUploadError("上传失败，请确认选择的都是 PDF 文件");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <section className="mb-6 rounded border border-dashed border-slate-400 bg-slate-50 p-4">
        <h2 className="font-medium">📥 PDF 输入（统一起点）</h2>
        <p className="mt-1 text-sm text-gray-500">上传一批 PDF，提交后立即按下面的节点顺序在后台异步执行，不会卡住页面。</p>

        {nodes.length === 0 ? (
          <p className="mt-3 text-sm text-amber-600">还没有处理节点，先在下面「+ 添加节点」搭建流程，再回来上传运行。</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept="application/pdf" multiple onChange={handleUploadFilesChange} className="text-sm" />
            <button
              onClick={handleUploadAndRun}
              disabled={uploading || !uploadFiles || uploadFiles.length === 0}
              className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {uploading ? "上传中…" : "上传并运行"}
            </button>
          </div>
        )}
        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}

        {latestRun && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[latestRun.status]}`} />
            最近一次：{latestRun.input_files.length} 个文件 · 状态 {latestRun.status}
            <Link to={`${basePath}/runs/${latestRun.id}`} className="whitespace-nowrap text-slate-800 underline">
              查看详情
            </Link>
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {sortedNodes.map((n) => {
          const isExpanded = expandedId === n.id;
          const runStatus = runStatusFor(n.id);
          const fileBadge = deriveFileBadge(n.name, n.code, n.prompt);

          return (
            <div key={n.id} className="rounded border border-gray-200 bg-white">
              <button
                onClick={() => toggleExpand(n.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-gray-400">{n.order_index + 1}</span>
                  {runStatus && (
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[runStatus.status]}`} />
                  )}
                  <span className="truncate font-medium">{n.name}</span>
                  <span className="whitespace-nowrap rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">
                    {fileBadge.icon} {fileBadge.label}
                  </span>
                </div>
                <span className="whitespace-nowrap text-sm text-gray-400">{isExpanded ? "收起 ▲" : "展开编辑 ▼"}</span>
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-4 border-t border-gray-100 p-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">节点名称</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-1.5"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-500">Code（处理逻辑代码）</label>
                      <label className="whitespace-nowrap text-xs text-slate-600 underline hover:text-slate-800">
                        📁 上传代码文件
                        <input
                          type="file"
                          accept=".py,.txt,text/x-python,text/plain"
                          onChange={handleCodeFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <Editor
                      height="240px"
                      language="python"
                      value={editCode}
                      onChange={(value) => setEditCode(value ?? "")}
                      options={{ minimap: { enabled: false }, fontSize: 13 }}
                    />
                  </div>

                  {isDirty && (
                    <div className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                      <span className="text-amber-700">● 有未保存的修改（比如刚上传的代码），记得点保存</span>
                      <button
                        onClick={handleSaveNode}
                        className="whitespace-nowrap rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                      >
                        立即保存
                      </button>
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-500">Prompt（AI 提示词）</label>
                      <label className="whitespace-nowrap text-xs text-slate-600 underline hover:text-slate-800">
                        📁 上传 Prompt 文件
                        <input
                          type="file"
                          accept=".txt,text/plain"
                          onChange={handlePromptFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={6}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      placeholder="例如：请总结本节点输入文本的核心要点……"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Code 执行时会自动用到这里的 Prompt：调用 <code className="font-mono">sdk.call_llm(content=...)</code>{" "}
                      不传 prompt 参数时默认就是这段文字，也可以在 Code 里用 <code className="font-mono">sdk.prompt</code> 直接拿到这段文本——两者本来就是联动的，不用额外接线。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSaveNode}
                      className="whitespace-nowrap rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => handleMove(-1)}
                      className="whitespace-nowrap rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      ← 前移
                    </button>
                    <button
                      onClick={() => handleMove(1)}
                      className="whitespace-nowrap rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      后移 →
                    </button>
                    <button
                      onClick={handleDeleteNode}
                      className="whitespace-nowrap rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>

                  {runStatus && (
                    <div className="rounded border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div className="font-medium text-gray-700">最近一次运行产出</div>
                      <p className="mt-1 text-gray-500">状态：{runStatus.status}</p>
                      {runStatus.output_files.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {runStatus.output_files.map((f) => (
                            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {f.original_filename}（{(f.size_bytes / 1024).toFixed(1)} KB）
                              </span>
                              <button
                                onClick={() => onDownload(f.id, f.original_filename)}
                                className="whitespace-nowrap text-slate-800 underline"
                              >
                                下载
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-gray-400">这次运行没有产出文件</p>
                      )}
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    {versions === null ? (
                      <button onClick={loadVersions} className="whitespace-nowrap text-sm text-slate-600 underline">
                        查看版本历史
                      </button>
                    ) : (
                      <div>
                        <div className="mb-2 text-sm font-medium text-gray-700">版本历史</div>
                        {versions.length === 0 && <p className="text-sm text-gray-400">暂无历史版本</p>}
                        <ul className="flex flex-col gap-2">
                          {versions.map((v) => (
                            <li
                              key={v.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
                            >
                              <span>
                                v{v.version_no} · {new Date(v.saved_at).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleRestore(v.id)}
                                className="whitespace-nowrap text-slate-800 underline"
                              >
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
          );
        })}
      </div>

      <button
        onClick={handleAddNode}
        className="mt-4 whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
      >
        + 添加节点
      </button>
    </div>
  );
}
