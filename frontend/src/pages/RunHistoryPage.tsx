import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";

interface RunSummary {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  triggered_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const STATUS_LABEL: Record<RunSummary["status"], string> = {
  pending: "等待中",
  running: "执行中",
  success: "成功",
  failed: "失败",
};

const STATUS_COLOR: Record<RunSummary["status"], string> = {
  pending: "text-gray-500",
  running: "text-blue-600",
  success: "text-green-600",
  failed: "text-red-600",
};

export default function RunHistoryPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/projects/${projectId}/workflows/${workflowId}/runs`;

  async function loadRuns() {
    const response = await apiClient.get<RunSummary[]>(basePath);
    setRuns(response.data);
  }

  useEffect(() => {
    loadRuns();
    const timer = setInterval(loadRuns, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowId]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(e.target.files);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      await apiClient.post(basePath, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setFiles(null);
      const input = document.getElementById("pdf-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadRuns();
    } catch {
      setError("上传失败，请确认选择的都是 PDF 文件");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <Link to={`/projects/${projectId}/workflows/${workflowId}`} className="whitespace-nowrap text-sm text-slate-600 underline">
        ← 返回工作流编辑器
      </Link>
      <h1 className="page-title mb-6 mt-2 text-xl">运行历史</h1>

      <form onSubmit={handleSubmit} className="mb-8 rounded border border-gray-200 p-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">上传 PDF 文件并触发一次运行</label>
        <div className="flex flex-wrap items-center gap-3">
          <input id="pdf-file-input" type="file" accept="application/pdf" multiple onChange={handleFileChange} className="text-sm" />
          <button
            type="submit"
            disabled={uploading || !files || files.length === 0}
            className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {uploading ? "上传中…" : "上传并运行"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">状态</th>
            <th>创建时间</th>
            <th>耗时</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const durationMs =
              r.started_at && r.finished_at
                ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
                : null;
            return (
              <tr key={r.id} className="border-b border-gray-100">
                <td className={`py-2 font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "-"}</td>
                <td>
                  <Link to={`${basePath}/${r.id}`} className="whitespace-nowrap text-slate-800 underline">
                    查看详情
                  </Link>
                </td>
              </tr>
            );
          })}
          {runs.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-400">
                暂无运行记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
