import { ChangeEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

type AssetKind = "code" | "prompt";

interface AssetRow {
  id: string;
  kind: AssetKind;
  name: string;
  created_by: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  name: string;
}

const PAGE_SIZE = 8;

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

export default function AssetLibraryPage() {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const { projectId } = useParams<{ projectId: string }>();
  const [kind, setKind] = useState<AssetKind>("code");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newName, setNewName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);

  async function loadAssets() {
    const [assetsRes, usersRes] = await Promise.all([
      apiClient.get<AssetRow[]>(`/projects/${projectId}/assets`, { params: { kind } }),
      apiClient.get<UserRow[]>("/users"),
    ]);
    setAssets(assetsRes.data);
    setUsers(usersRes.data);
  }

  useEffect(() => {
    setPage(1);
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kind]);

  function ownerLabel(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? t("Unknown user");
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await apiClient.post(`/projects/${projectId}/assets`, { kind, name: newName, content: "" });
    setNewName("");
    await loadAssets();
  }

  async function handleUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const content = await file.text();
      await apiClient.post(`/projects/${projectId}/assets`, {
        kind,
        name: stripExtension(file.name),
        content,
      });
      await loadAssets();
    } finally {
      setUploading(false);
    }
  }

  const kindLabel = kind === "code" ? "Code" : "Prompt";
  const totalPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const pageItems = assets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="page-title mb-2 text-xl">{t("Code / Prompt library")}</h1>
      <p className="mb-6 text-sm text-gray-500">{t("Project-level reusable assets. Pick them directly when editing workflow nodes instead of retyping.")}</p>

      <div className="mb-4 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setKind("code")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            kind === "code" ? "border-slate-800 font-medium text-slate-800" : "border-transparent text-gray-500"
          }`}
        >
          Code
        </button>
        <button
          onClick={() => setKind("prompt")}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            kind === "prompt" ? "border-slate-800 font-medium text-slate-800" : "border-transparent text-gray-500"
          }`}
        >
          Prompt
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded border border-gray-200 bg-gray-50 p-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("New {kind} asset name", { kind: kindLabel })}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          {t("+ New blank asset")}
        </button>
        <span className="text-xs text-gray-400">{t("or")}</span>
        <label className="whitespace-nowrap rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">
          {uploading ? t("Uploading…") : t("📁 Upload {ext} file", { ext: kind === "code" ? ".py" : ".txt" })}
          <input
            type="file"
            accept={kind === "code" ? ".py,.txt,text/x-python,text/plain" : ".txt,text/plain"}
            onChange={handleUploadFile}
            className="hidden"
          />
        </label>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("Name")}</th>
            <th>{t("Owner")}</th>
            <th>{t("Updated at")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((a) => (
            <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2">
                <Link to={`/projects/${projectId}/assets/${a.id}`} className="font-medium text-slate-800 underline">
                  {a.name}
                </Link>
              </td>
              <td>
                <span className="whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                  {t("Owner: {name}", { name: ownerLabel(a.created_by) })}
                </span>
              </td>
              <td className="whitespace-nowrap text-xs text-gray-400">{new Date(a.updated_at).toLocaleString(locale)}</td>
            </tr>
          ))}
          {assets.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-gray-400">
                {t("No {kind} assets yet", { kind: kindLabel })}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-sm ${
                p === page ? "bg-slate-800 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
