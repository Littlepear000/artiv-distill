import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { fileTypeLabel } from "../utils/fileType";
import { useI18n } from "../i18n";

interface FileInfo {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  source: string;
  created_at: string;
}

interface NodeRun {
  id: string;
  node_id: string;
  node_name: string;
  order_index: number;
  status: "pending" | "running" | "success" | "failed";
  duration_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  output_files: FileInfo[];
}

interface RunDetail {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  triggered_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  input_files: FileInfo[];
  node_runs: NodeRun[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  success: "Succeeded",
  failed: "Failed",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-gray-500",
  running: "text-blue-600",
  success: "text-green-600",
  failed: "text-red-600",
};

export default function RunDetailPage() {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const { projectId, workflowId, runId } = useParams<{ projectId: string; workflowId: string; runId: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);

  const basePath = `/projects/${projectId}/workflows/${workflowId}/runs/${runId}`;

  async function load() {
    const response = await apiClient.get<RunDetail>(basePath);
    setRun(response.data);
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (run && (run.status === "success" || run.status === "failed")) return;
      load();
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workflowId, runId, run?.status]);

  async function handleDownload(fileId: string, filename: string) {
    const response = await apiClient.get(`${basePath}/files/${fileId}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  if (!run) return <div className="p-8 text-center text-gray-500">{t("Loading…")}</div>;

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <Link
        to={`/projects/${projectId}/workflows/${workflowId}/runs`}
        className="whitespace-nowrap text-sm text-slate-600 underline"
      >
        {t("← Back to run history")}
      </Link>
      <h1 className="page-title mb-2 mt-2 text-xl">
        {t("Run details")} <span className={STATUS_COLOR[run.status]}>({t(STATUS_LABEL[run.status])})</span>
      </h1>
      <p className="mb-6 text-sm text-gray-500">{t("Created at {time}", { time: new Date(run.created_at).toLocaleString(locale) })}</p>

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">{t("Input files")}</h2>
        <ul className="flex flex-col gap-1">
          {run.input_files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {f.original_filename}{" "}
                <span className="whitespace-nowrap rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-600">
                  {fileTypeLabel(f.content_type, f.original_filename, t)}
                </span>{" "}
                {t("({size} KB)", { size: (f.size_bytes / 1024).toFixed(1) })}
              </span>
              <button
                onClick={() => handleDownload(f.id, f.original_filename)}
                className="whitespace-nowrap text-slate-800 underline"
              >
                {t("Download")}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mb-2 text-sm font-medium text-gray-700">{t("Node execution")}</h2>
      <ul className="flex flex-col gap-3">
        {run.node_runs.map((nr) => (
          <li key={nr.id} className="rounded border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {nr.order_index + 1}. {nr.node_name}
              </span>
              <span className={`whitespace-nowrap text-sm font-medium ${STATUS_COLOR[nr.status]}`}>
                {t(STATUS_LABEL[nr.status])}
              </span>
            </div>
            {nr.duration_ms !== null && <p className="mt-1 text-xs text-gray-500">{t("Duration {ms} ms", { ms: nr.duration_ms })}</p>}
            {nr.error_message && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">
                {nr.error_message}
              </pre>
            )}
            {nr.output_files.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {nr.output_files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {f.original_filename}{" "}
                      <span className="whitespace-nowrap rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-600">
                        {fileTypeLabel(f.content_type, f.original_filename, t)}
                      </span>{" "}
                      {t("({size} KB)", { size: (f.size_bytes / 1024).toFixed(1) })}
                    </span>
                    <button
                      onClick={() => handleDownload(f.id, f.original_filename)}
                      className="whitespace-nowrap text-slate-800 underline"
                    >
                      {t("Download")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {run.node_runs.length === 0 && <p className="text-sm text-gray-400">{t("No nodes have started executing yet")}</p>}
      </ul>
    </div>
  );
}
