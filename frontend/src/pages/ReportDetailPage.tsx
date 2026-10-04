import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

type Source = "manual" | "excel_import" | "system_parse";

interface FieldRow {
  id: string;
  key: string;
  label: string;
  data_type: string;
  description: string | null;
  group_name?: string | null;
}

interface ReportOut {
  id: string;
  name: string;
  source_url: string | null;
  has_file: boolean;
  uploader_name: string;
  created_at: string;
  updated_at: string;
}

interface ValueItem {
  id: string;
  field_id: string;
  field_key: string;
  value: string;
  source: Source;
  note: string | null;
  run_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  is_selected: boolean;
  is_pinned: boolean;
}

const SOURCE_STYLE: Record<Source, string> = {
  manual: "bg-blue-50 text-blue-700",
  excel_import: "bg-green-50 text-green-700",
  system_parse: "bg-purple-50 text-purple-700",
};
const SOURCE_LABEL: Record<Source, string> = {
  manual: "manual",
  excel_import: "excel",
  system_parse: "system",
};

function errorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}

export default function ReportDetailPage() {
  const { projectId, reportId } = useParams<{ projectId: string; reportId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const base = `/projects/${projectId}`;

  const [canWrite, setCanWrite] = useState(false);
  const [report, setReport] = useState<ReportOut | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [values, setValues] = useState<ValueItem[]>([]);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [projRes, repRes, fieldsRes, valuesRes] = await Promise.all([
        apiClient.get<{ my_role: string }>(base),
        apiClient.get<ReportOut>(`${base}/reports/${reportId}`),
        apiClient.get<FieldRow[]>(`${base}/report-fields`),
        apiClient.get<ValueItem[]>(`${base}/reports/${reportId}/values`),
      ]);
      setCanWrite(projRes.data.my_role !== "viewer");
      setReport(repRes.data);
      setFields(fieldsRes.data);
      setValues(valuesRes.data);
    } catch (err) {
      setError(errorText(err, t("Failed to load report")));
    }
  }, [base, reportId, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function reloadValues() {
    const res = await apiClient.get<ValueItem[]>(`${base}/reports/${reportId}/values`);
    setValues(res.data);
  }

  function startEdit() {
    if (!report) return;
    setNameDraft(report.name);
    setUrlDraft(report.source_url ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    setError("");
    try {
      const res = await apiClient.patch<ReportOut>(`${base}/reports/${reportId}`, {
        name: nameDraft.trim(),
        source_url: urlDraft.trim() || null,
      });
      setReport(res.data);
      setEditing(false);
    } catch (err) {
      setError(errorText(err, t("Failed to save")));
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.post<ReportOut>(`${base}/reports/${reportId}/file`, fd);
      setReport(res.data);
    } catch (err) {
      setError(errorText(err, t("Upload failed")));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    setError("");
    try {
      const res = await apiClient.get<{ url: string }>(`${base}/reports/${reportId}/file-url`);
      window.open(res.data.url, "_blank");
    } catch (err) {
      setError(errorText(err, t("No file available")));
    }
  }

  async function handleDeleteReport() {
    if (!window.confirm(t("Delete this report and all its parsed values?"))) return;
    await apiClient.delete(`${base}/reports/${reportId}`);
    navigate(base);
  }

  if (!report) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-gray-500">{error || t("Loading...")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link to={base} className="text-sm text-slate-600 underline">
        {t("Back to reports")}
      </Link>
      <h1 className="page-title mb-4 mt-2 text-xl">{report.name}</h1>

      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <section className="mb-8 rounded border border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-800">{t("Basic info")}</h2>
          {canWrite && !editing && (
            <div className="flex gap-3 text-sm">
              <button onClick={startEdit} className="text-slate-600 hover:underline">
                {t("Edit")}
              </button>
              <button onClick={handleDeleteReport} className="text-red-600 hover:underline">
                {t("Delete")}
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("Name")}</label>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("Link")}</label>
              <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={!nameDraft.trim()} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
                {t("Save")}
              </button>
              <button onClick={() => setEditing(false)} className="rounded border border-gray-300 px-4 py-2 text-sm">
                {t("Cancel")}
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-gray-500">{t("Name")}</dt>
            <dd>{report.name}</dd>
            <dt className="text-gray-500">{t("Link")}</dt>
            <dd className="break-all">
              {report.source_url ? (
                report.source_url.startsWith("http") ? (
                  <a href={report.source_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    {report.source_url}
                  </a>
                ) : (
                  report.source_url
                )
              ) : (
                <span className="text-gray-300">-</span>
              )}
            </dd>
            <dt className="text-gray-500">{t("Uploaded by")}</dt>
            <dd>{report.uploader_name}</dd>
            <dt className="text-gray-500">{t("Uploaded")}</dt>
            <dd>{new Date(report.created_at).toLocaleString()}</dd>
            <dt className="text-gray-500">{t("File")}</dt>
            <dd className="flex flex-wrap items-center gap-3">
              {report.has_file ? (
                <button onClick={handleDownload} className="text-blue-600 underline">
                  {t("Download file")}
                </button>
              ) : (
                <span className="text-gray-400">{t("No file uploaded")}</span>
              )}
              {canWrite && (
                <label className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-gray-50">
                  {uploading ? t("Uploading...") : report.has_file ? t("Replace file") : t("Upload file")}
                  <input type="file" accept=".pdf,application/pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
              )}
            </dd>
          </dl>
        )}
      </section>

      <h2 className="page-title mb-3 text-lg">{t("Parsed data")}</h2>
      {fields.length === 0 ? (
        <p className="text-sm text-gray-400">
          {t("No result fields are configured yet.")}{" "}
          <Link to={`${base}/report-fields`} className="text-slate-700 underline">
            {t("Configure result fields")}
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(new Set(fields.map((f) => f.group_name ?? ""))).sort((x, y) => (x === "" ? 1 : y === "" ? -1 : 0)).map((g) => (
            <section key={g || "__ungrouped__"}>
              {fields.some((f) => f.group_name) && (
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{g || t("Ungrouped")}</h3>
              )}
              <div className="space-y-4">
                {fields
                  .filter((f) => (f.group_name ?? "") === g)
                  .map((f) => (
                    <FieldCard
                      key={f.id}
                      base={base}
                      reportId={reportId!}
                      field={f}
                      items={values.filter((v) => v.field_id === f.id)}
                      canWrite={canWrite}
                      onChanged={reloadValues}
                      onError={setError}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldCard({
  base,
  reportId,
  field,
  items,
  canWrite,
  onChanged,
  onError,
}: {
  base: string;
  reportId: string;
  field: FieldRow;
  items: ValueItem[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [newValue, setNewValue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [useAsCurrent, setUseAsCurrent] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = items.find((v) => v.is_selected);
  const url = `${base}/reports/${reportId}/fields/${field.id}`;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    onError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(errorText(err, t("Action failed")));
    } finally {
      setBusy(false);
    }
  }

  async function addValue() {
    if (!newValue.trim()) return;
    await act(async () => {
      await apiClient.post(`${url}/values`, {
        value: newValue.trim(),
        note: newNote.trim() || null,
        select: useAsCurrent,
      });
      setNewValue("");
      setNewNote("");
      setUseAsCurrent(false);
    });
  }

  return (
    <section className="rounded border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-medium text-slate-800">{field.label}</h3>
          {field.description && <p className="text-xs text-gray-400">{field.description}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">{t("Current value")}:</span>
          {selected ? (
            <span className="inline-flex items-center gap-1 font-medium">
              {selected.value}
              <span className={`rounded px-1 py-0.5 text-[10px] font-normal ${SOURCE_STYLE[selected.source]}`}>{t(SOURCE_LABEL[selected.source])}</span>
              {selected.is_pinned && <span title={t("Pinned")}>📌</span>}
            </span>
          ) : (
            <span className="text-gray-300">-</span>
          )}
          {canWrite && selected?.is_pinned && (
            <button disabled={busy} onClick={() => act(() => apiClient.delete(`${url}/selected`))} className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-gray-50">
              {t("Unpin / auto")}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400">{t("No values recorded yet")}</p>
      ) : (
        <ol className="mb-3 space-y-2 border-l-2 border-gray-100 pl-4">
          {items.map((v) => (
            <li key={v.id} className={`relative rounded p-2 text-sm ${v.is_selected ? "bg-slate-50" : ""}`}>
              <span className={`absolute -left-[22px] top-3 h-2 w-2 rounded-full ${v.is_selected ? "bg-slate-800" : "bg-gray-300"}`} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.value}</span>
                <span className={`rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE[v.source]}`}>{t(SOURCE_LABEL[v.source])}</span>
                {v.is_selected && <span className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-white">{t("Current")}</span>}
                {v.is_pinned && <span title={t("Pinned")}>📌</span>}
                <span className="flex-1" />
                {canWrite && (
                  <>
                    {!(v.is_selected && v.is_pinned) && (
                      <button disabled={busy} onClick={() => act(() => apiClient.put(`${url}/selected`, { value_id: v.id }))} className="text-xs text-slate-700 underline">
                        {t("Use this value")}
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t("Delete this value?"))) act(() => apiClient.delete(`${base}/reports/${reportId}/values/${v.id}`));
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {t("Delete")}
                    </button>
                  </>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {v.created_by_name ?? t("System")} · {new Date(v.created_at).toLocaleString()}
                {v.run_id && (
                  <>
                    {" · "}
                    <span title={v.run_id}>{t("Run")} {v.run_id.slice(0, 8)}</span>
                  </>
                )}
              </div>
              {v.note && <div className="mt-0.5 text-xs text-gray-500">{v.note}</div>}
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-gray-50 p-2">
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={t("New value")} className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={t("Note (optional)")} className="min-w-[10rem] flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-600">
            <input type="checkbox" checked={useAsCurrent} onChange={(e) => setUseAsCurrent(e.target.checked)} />
            {t("Use as current")}
          </label>
          <button onClick={addValue} disabled={busy || !newValue.trim()} className="whitespace-nowrap rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {t("Add value")}
          </button>
        </div>
      )}
    </section>
  );
}
