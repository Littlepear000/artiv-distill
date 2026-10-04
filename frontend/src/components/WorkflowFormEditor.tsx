import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { deriveFileBadge } from "./WorkflowNodeCard";
import { fileTypeLabel } from "../utils/fileType";
import { useI18n } from "../i18n";

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
  code_asset_id: string | null;
  code_asset_version: number | null;
  prompt_asset_id: string | null;
  prompt_asset_version: number | null;
}

interface AssetOption {
  id: string;
  name: string;
  content: string;
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
  projectId: string;
  nodes: WorkflowNodeData[];
  latestRun: RunDetail | null;
  onReload: () => Promise<void>;
  onDownload: (fileId: string, filename: string) => void;
}

/**
 * 工作流的「编辑」tab：表单/输入框形式配置节点，不用画布拖拽。
 * 可视化展示挪到了单独的「流程图」tab（WorkflowDiagramView），这里只管编辑。
 */
export default function WorkflowFormEditor({ basePath, projectId, nodes, latestRun, onReload, onDownload }: Props) {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [versions, setVersions] = useState<NodeVersion[] | null>(null);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [codeAssets, setCodeAssets] = useState<AssetOption[]>([]);
  const [promptAssets, setPromptAssets] = useState<AssetOption[]>([]);
  const [editCodeAssetId, setEditCodeAssetId] = useState<string | null>(null);
  const [editCodeAssetVersion, setEditCodeAssetVersion] = useState<number | null>(null);
  const [editPromptAssetId, setEditPromptAssetId] = useState<string | null>(null);
  const [editPromptAssetVersion, setEditPromptAssetVersion] = useState<number | null>(null);

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
      setEditCodeAssetId(expandedNode.code_asset_id);
      setEditCodeAssetVersion(expandedNode.code_asset_version);
      setEditPromptAssetId(expandedNode.prompt_asset_id);
      setEditPromptAssetVersion(expandedNode.prompt_asset_version);
      setVersions(null);
    }
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.get<AssetOption[]>(`/projects/${projectId}/assets`, { params: { kind: "code" } }).then((r) => setCodeAssets(r.data));
    apiClient.get<AssetOption[]>(`/projects/${projectId}/assets`, { params: { kind: "prompt" } }).then((r) => setPromptAssets(r.data));
  }, [projectId]);

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
      const confirmed = window.confirm(t("This node has unsaved changes that will be lost if you leave now. Continue?"));
      if (!confirmed) return;
    }
    setExpandedId((current) => (current === nodeId ? null : nodeId));
  }

  async function handleAddNode() {
    const response = await apiClient.post<WorkflowNodeData>(`${basePath}/nodes`, {
      name: t("New node {n}", { n: nodes.length + 1 }),
      code: "",
      prompt: "",
      position: { x: nodes.length * 220 + 40, y: 120 },
    });
    await onReload();
    setExpandedId(response.data.id);
  }

  async function handleSaveNode() {
    if (!expandedNode) return;
    await apiClient.patch(`${basePath}/nodes/${expandedNode.id}`, {
      name: editName,
      code: editCode,
      prompt: editPrompt,
      code_asset_id: editCodeAssetId,
      code_asset_version: editCodeAssetVersion,
      prompt_asset_id: editPromptAssetId,
      prompt_asset_version: editPromptAssetVersion,
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

  async function currentVersionOf(assetId: string): Promise<number> {
    const response = await apiClient.get<{ version_no: number }[]>(`/projects/${projectId}/assets/${assetId}/versions`);
    const maxSaved = response.data.reduce((max, v) => Math.max(max, v.version_no), 0);
    return maxSaved + 1; // 当前内容还没被编辑过，天然就是"下一个会生成的版本号"
  }

  async function handleSelectCodeAsset(assetId: string) {
    if (!assetId) {
      setEditCode("");
      setEditCodeAssetId(null);
      setEditCodeAssetVersion(null);
      return;
    }
    const asset = codeAssets.find((a) => a.id === assetId);
    if (!asset) return;
    setEditCode(asset.content);
    setEditCodeAssetId(asset.id);
    setEditCodeAssetVersion(await currentVersionOf(asset.id));
  }

  async function handleSelectPromptAsset(assetId: string) {
    if (!assetId) {
      setEditPrompt("");
      setEditPromptAssetId(null);
      setEditPromptAssetVersion(null);
      return;
    }
    const asset = promptAssets.find((a) => a.id === assetId);
    if (!asset) return;
    setEditPrompt(asset.content);
    setEditPromptAssetId(asset.id);
    setEditPromptAssetVersion(await currentVersionOf(asset.id));
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
      setUploadError(t("Upload failed. Make sure all selected files are PDFs"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <section className="mb-6 rounded border border-dashed border-slate-400 bg-slate-50 p-4">
        <h2 className="font-medium">📥 {t("PDF input (common starting point)")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("Upload a batch of PDFs. After submitting, the nodes below run in order in the background without blocking the page.")}</p>

        {nodes.length === 0 ? (
          <p className="mt-3 text-sm text-amber-600">{t("There are no processing nodes yet. Build the flow with \"+ Add node\" below, then come back to upload and run.")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept="application/pdf" multiple onChange={handleUploadFilesChange} className="text-sm" />
            <button
              onClick={handleUploadAndRun}
              disabled={uploading || !uploadFiles || uploadFiles.length === 0}
              className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {uploading ? t("Uploading…") : t("Upload and run")}
            </button>
          </div>
        )}
        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}

        {latestRun && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[latestRun.status]}`} />
            {t("Latest: {count} files · status {status}", { count: latestRun.input_files.length, status: latestRun.status })}
            <Link to={`${basePath}/runs/${latestRun.id}`} className="whitespace-nowrap text-slate-800 underline">
              {t("View details")}
            </Link>
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {sortedNodes.map((n) => {
          const isExpanded = expandedId === n.id;
          const runStatus = runStatusFor(n.id);
          const fileBadge = deriveFileBadge(n.name, n.code, n.prompt, t);

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
                <span className="whitespace-nowrap text-sm text-gray-400">{isExpanded ? t("Collapse ▲") : t("Expand to edit ▼")}</span>
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-4 border-t border-gray-100 p-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">{t("Node name")}</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-1.5"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">{t("Code (processing logic)")}</label>
                    <select
                      value={editCodeAssetId ?? ""}
                      onChange={(e) => handleSelectCodeAsset(e.target.value)}
                      className="select-chevron w-full rounded border border-gray-300 py-1.5 pl-2 text-sm"
                    >
                      <option value="">{t("-- Select a Code asset --")}</option>
                      {codeAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    {editCodeAssetId ? (
                      <p className="mt-1 text-xs text-blue-700">
                        📎 {t("Currently using:")} {codeAssets.find((a) => a.id === editCodeAssetId)?.name ?? t("(deleted asset)")}{" "}
                        {editCodeAssetVersion !== null && `v${editCodeAssetVersion}`} ·{" "}
                        <Link to={`/projects/${projectId}/assets/${editCodeAssetId}`} className="underline">
                          {t("View / edit code")}
                        </Link>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-600">
                        {t("No Code asset selected, so this node has no code to run. No suitable asset? Go to the")}{" "}
                        <Link to={`/projects/${projectId}/assets`} className="underline">
                          {t("Code / Prompt library")}
                        </Link>{" "}
                        {t("to upload one.")}
                      </p>
                    )}
                  </div>

                  {isDirty && (
                    <div className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                      <span className="text-amber-700">● {t("Unsaved changes, remember to save")}</span>
                      <button
                        onClick={handleSaveNode}
                        className="whitespace-nowrap rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                      >
                        {t("Save now")}
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">{t("Prompt (AI prompt, optional)")}</label>
                    <select
                      value={editPromptAssetId ?? ""}
                      onChange={(e) => handleSelectPromptAsset(e.target.value)}
                      className="select-chevron w-full rounded border border-gray-300 py-1.5 pl-2 text-sm"
                    >
                      <option value="">{t("-- No Prompt --")}</option>
                      {promptAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    {editPromptAssetId && (
                      <p className="mt-1 text-xs text-blue-700">
                        📎 {t("Currently using:")} {promptAssets.find((a) => a.id === editPromptAssetId)?.name ?? t("(deleted asset)")}{" "}
                        {editPromptAssetVersion !== null && `v${editPromptAssetVersion}`} ·{" "}
                        <Link to={`/projects/${projectId}/assets/${editPromptAssetId}`} className="underline">
                          {t("View / edit Prompt")}
                        </Link>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      {t("The selected Prompt is used automatically when Code runs: when you call")}{" "}
                      <code className="font-mono">sdk.call_llm(content=...)</code>{" "}
                      {t("without a prompt argument, this text is the default. You can also get it in Code via")}{" "}
                      <code className="font-mono">sdk.prompt</code>.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSaveNode}
                      className="whitespace-nowrap rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
                    >
                      {t("Save")}
                    </button>
                    <button
                      onClick={() => handleMove(-1)}
                      className="whitespace-nowrap rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {t("← Move up")}
                    </button>
                    <button
                      onClick={() => handleMove(1)}
                      className="whitespace-nowrap rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {t("Move down →")}
                    </button>
                    <button
                      onClick={handleDeleteNode}
                      className="whitespace-nowrap rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>

                  {runStatus && (
                    <div className="rounded border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div className="font-medium text-gray-700">{t("Latest run output")}</div>
                      <p className="mt-1 text-gray-500">{t("Status: {status}", { status: runStatus.status })}</p>
                      {runStatus.output_files.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {runStatus.output_files.map((f) => (
                            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {f.original_filename}{" "}
                                <span className="whitespace-nowrap rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-600">
                                  {fileTypeLabel(f.content_type, f.original_filename, t)}
                                </span>{" "}
                                {t("({size} KB)", { size: (f.size_bytes / 1024).toFixed(1) })}
                              </span>
                              <button
                                onClick={() => onDownload(f.id, f.original_filename)}
                                className="whitespace-nowrap text-slate-800 underline"
                              >
                                {t("Download")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-gray-400">{t("This run produced no files")}</p>
                      )}
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    {versions === null ? (
                      <button onClick={loadVersions} className="whitespace-nowrap text-sm text-slate-600 underline">
                        {t("View version history")}
                      </button>
                    ) : (
                      <div>
                        <div className="mb-2 text-sm font-medium text-gray-700">{t("Version history")}</div>
                        {versions.length === 0 && <p className="text-sm text-gray-400">{t("No version history yet")}</p>}
                        <ul className="flex flex-col gap-2">
                          {versions.map((v) => (
                            <li
                              key={v.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
                            >
                              <span>
                                v{v.version_no} · {new Date(v.saved_at).toLocaleString(locale)}
                              </span>
                              <button
                                onClick={() => handleRestore(v.id)}
                                className="whitespace-nowrap text-slate-800 underline"
                              >
                                {t("Restore this version")}
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
        {t("+ Add node")}
      </button>
    </div>
  );
}
