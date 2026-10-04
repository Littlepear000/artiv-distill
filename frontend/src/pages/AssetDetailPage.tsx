import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

type AssetKind = "code" | "prompt";

interface AssetDetail {
  id: string;
  kind: AssetKind;
  name: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  name: string;
}

interface AssetVersion {
  id: string;
  version_no: number;
  content_snapshot: string;
  saved_by: string;
  saved_at: string;
}

export default function AssetDetailPage() {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const { projectId, assetId } = useParams<{ projectId: string; assetId: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [previewVersion, setPreviewVersion] = useState<AssetVersion | null>(null);

  const basePath = `/projects/${projectId}/assets`;

  async function loadAll() {
    const [assetRes, usersRes, versionsRes] = await Promise.all([
      apiClient.get<AssetDetail>(`${basePath}/${assetId}`),
      apiClient.get<UserRow[]>("/users"),
      apiClient.get<AssetVersion[]>(`${basePath}/${assetId}/versions`),
    ]);
    setAsset(assetRes.data);
    setEditName(assetRes.data.name);
    setEditContent(assetRes.data.content);
    setUsers(usersRes.data);
    setVersions(versionsRes.data);
    setPreviewVersion(null);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, assetId]);

  const isDirty = asset ? editName !== asset.name || editContent !== asset.content : false;

  // 离开页面前兜底：切路由拦不住（这是个独立路由页面，不是站内切换），至少把关标签页/刷新这类拦下来
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function ownerLabel(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? t("Unknown user");
  }

  async function handleSave() {
    if (!asset) return;
    await apiClient.patch(`${basePath}/${asset.id}`, { name: editName, content: editContent });
    await loadAll();
  }

  async function handleDelete() {
    if (!asset) return;
    const confirmed = window.confirm(
      t("Delete asset \"{name}\"? Nodes that already use it are not affected, but it can no longer be selected.", { name: asset.name })
    );
    if (!confirmed) return;
    await apiClient.delete(`${basePath}/${asset.id}`);
    navigate(`/projects/${projectId}/assets`);
  }

  async function handleRestore(versionId: string) {
    if (!asset) return;
    const confirmed = window.confirm(t("Restore this version? The current content will first be saved as a new version, so nothing is lost."));
    if (!confirmed) return;
    await apiClient.post(`${basePath}/${asset.id}/versions/${versionId}/restore`);
    await loadAll();
  }

  function handleLeave() {
    if (isDirty) {
      const confirmed = window.confirm(t("You have unsaved changes that will be lost if you leave now. Continue?"));
      if (!confirmed) return;
    }
    navigate(`/projects/${projectId}/assets`);
  }

  if (!asset) return <div className="p-8 text-center text-gray-500">{t("Loading…")}</div>;

  const kindLabel = asset.kind === "code" ? "Code" : "Prompt";
  const displayedContent = previewVersion ? previewVersion.content_snapshot : editContent;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button onClick={handleLeave} className="whitespace-nowrap text-sm text-slate-600 underline">
            {t("← Back to {kind} library", { kind: kindLabel })}
          </button>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="page-title min-w-0 rounded border border-transparent px-1 text-lg hover:border-gray-300 focus:border-gray-300 focus:outline-none"
          />
          <span className="whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
            {t("Owner: {name}", { name: ownerLabel(asset.created_by) })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isDirty && <span className="whitespace-nowrap text-xs text-amber-700">● {t("Unsaved changes")}</span>}
          <button
            onClick={handleSave}
            className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            {t("Save")}
          </button>
          <button
            onClick={handleDelete}
            className="whitespace-nowrap rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            {t("Delete")}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {previewVersion && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <span className="text-amber-700">
                {t("Previewing v{no} ({time}), read-only, nothing written back", {
                  no: previewVersion.version_no,
                  time: new Date(previewVersion.saved_at).toLocaleString(locale),
                })}
              </span>
              <div className="flex gap-3">
                <button onClick={() => handleRestore(previewVersion.id)} className="whitespace-nowrap text-slate-800 underline">
                  {t("Restore this version")}
                </button>
                <button onClick={() => setPreviewVersion(null)} className="whitespace-nowrap text-slate-600 underline">
                  {t("Back to current edit")}
                </button>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden rounded border border-gray-200">
            {asset.kind === "code" ? (
              previewVersion ? (
                // 预览历史版本时换一个独立的只读 Editor 实例（不同 key 强制重新挂载），
                // 而不是复用同一个可编辑实例改 value —— Monaco 外部改 value 偶尔还是会
                // 把这次变化当成"用户输入"冒泡到 onChange，导致预览态被误判成"有未保存的修改"
                <Editor
                  key="preview"
                  height="100%"
                  language="python"
                  value={previewVersion.content_snapshot}
                  options={{ minimap: { enabled: false }, fontSize: 14, readOnly: true }}
                />
              ) : (
                <Editor
                  key="editing"
                  height="100%"
                  language="python"
                  value={editContent}
                  onChange={(value) => setEditContent(value ?? "")}
                  options={{ minimap: { enabled: false }, fontSize: 14 }}
                />
              )
            ) : (
              <textarea
                value={displayedContent}
                onChange={(e) => !previewVersion && setEditContent(e.target.value)}
                readOnly={!!previewVersion}
                className="h-full w-full resize-none p-4 font-mono text-sm focus:outline-none"
              />
            )}
          </div>
        </div>

        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium text-gray-700">{t("Version history")}</h2>
          <p className="mb-3 text-xs text-gray-400">{t("Each save stores the previous content as a version; click a version to preview it before deciding whether to restore.")}</p>

          <ul className="flex flex-col gap-2">
            <li
              className={`rounded border px-3 py-2 text-sm ${
                previewVersion === null ? "border-slate-800 bg-slate-50" : "border-gray-100"
              }`}
            >
              <button onClick={() => setPreviewVersion(null)} className="w-full text-left">
                <div className="font-medium text-gray-700">{t("Current version")}</div>
                <div className="text-xs text-gray-400">{t("Updated at {time}", { time: new Date(asset.updated_at).toLocaleString(locale) })}</div>
              </button>
            </li>
            {versions.map((v) => (
              <li
                key={v.id}
                className={`rounded border px-3 py-2 text-sm ${
                  previewVersion?.id === v.id ? "border-slate-800 bg-slate-50" : "border-gray-100"
                }`}
              >
                <button onClick={() => setPreviewVersion(v)} className="w-full text-left">
                  <div className="font-medium text-gray-700">v{v.version_no}</div>
                  <div className="text-xs text-gray-400">
                    {ownerLabel(v.saved_by)} · {new Date(v.saved_at).toLocaleString(locale)}
                  </div>
                </button>
              </li>
            ))}
            {versions.length === 0 && <li className="text-sm text-gray-400">{t("No version history yet. It appears after the first saved change")}</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
