import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import ReportIngestModal from "../components/ReportIngestModal";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

interface ReportRow {
  id: string;
  name: string;
  source_url: string | null;
  has_file: boolean;
  uploaded_by: string;
  uploader_name: string;
  created_at: string;
  updated_at: string;
}

interface ImportResult {
  created: number;
  updated: number;
  values_added: number;
  values_skipped_duplicate: number;
  skipped_rows: { row: number; reason: string }[];
  unknown_columns: string[];
}

interface MatchResult {
  matched: { report_id: string; report_name: string; key: string }[];
  ambiguous: { report_name: string; keys: string[] }[];
  unmatched_reports: string[];
  unmatched_objects: string[];
  applied: boolean;
}

const PAGE_SIZE = 20;

function errorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string })?.msg ?? "").filter(Boolean).join("; ") || fallback;
  return fallback;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="page-title text-lg">{title}</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
            {t("Close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [canWrite, setCanWrite] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<null | "add" | "import" | "match">(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ items: ReportRow[]; total: number }>(`/projects/${projectId}/reports`, {
        params: { search: appliedSearch || undefined, page, page_size: PAGE_SIZE },
      });
      setReports(res.data.items);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [projectId, appliedSearch, page]);

  useEffect(() => {
    (async () => {
      const projRes = await apiClient.get<{ my_role: string }>(`/projects/${projectId}`);
      setCanWrite(projRes.data.my_role !== "viewer");
    })();
  }, [projectId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const colCount = 4;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="page-title mb-1 text-xl">{t("Reports")}</h1>
      <p className="mb-5 text-sm text-gray-500">{t("{n} reports", { n: total })}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={submitSearch} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search reports by name")}
            className="w-64 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="whitespace-nowrap rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">
            {t("Search")}
          </button>
        </form>
        <div className="flex-1" />
        {canWrite && (
          <>
            <button onClick={() => setModal("match")} className="whitespace-nowrap rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">
              {t("Match OSS files")}
            </button>
            <button onClick={() => setModal("import")} className="whitespace-nowrap rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">
              {t("Import Excel")}
            </button>
            <button onClick={() => setModal("add")} className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
              {t("Add reports")}
            </button>
          </>
        )}
        <Link to={`/projects/${projectId}/report-fields`} className="whitespace-nowrap text-sm text-slate-600 underline">
          {t("Result fields")}
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3">{t("Name")}</th>
              <th className="pr-3">{t("Link")}</th>
              <th className="pr-3">{t("Uploaded by")}</th>
              <th className="pr-3">{t("Uploaded")}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/projects/${projectId}/reports/${r.id}`)}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 pr-3 font-medium text-slate-800">{r.name}</td>
                <td className="max-w-[16rem] truncate pr-3" onClick={(e) => e.stopPropagation()}>
                  {r.source_url ? (
                    r.source_url.startsWith("http") ? (
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        {r.source_url}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-500">{r.source_url}</span>
                    )
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap pr-3">{r.uploader_name}</td>
                <td className="whitespace-nowrap pr-3 text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && reports.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-gray-400">
                  {t("No reports yet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">
            {t("Previous")}
          </button>
          <span className="text-gray-500">{t("Page {p} of {n}", { p: page, n: totalPages })}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">
            {t("Next")}
          </button>
        </div>
      )}

      {modal === "add" && (
        <ReportIngestModal
          projectId={projectId!}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            loadReports();
          }}
        />
      )}
      {modal === "import" && (
        <ImportModal
          projectId={projectId!}
          onClose={() => {
            setModal(null);
            loadReports();
          }}
        />
      )}
      {modal === "match" && (
        <MatchModal
          projectId={projectId!}
          onClose={() => {
            setModal(null);
            loadReports();
          }}
        />
      )}
    </div>
  );
}

function ImportModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function downloadTemplate() {
    setError("");
    try {
      const res = await apiClient.get(`/projects/${projectId}/reports/import-template`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reports_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err, t("Failed to download template")));
    }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.post<ImportResult>(`/projects/${projectId}/reports/import`, fd);
      setResult(res.data);
    } catch (err) {
      setError(errorText(err, t("Import failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("Import Excel")} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        {t("Upload an .xlsx file with one report per row. Columns: name, url, and any importable field.")}
      </p>
      <button onClick={downloadTemplate} className="mb-4 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-gray-50">
        {t("Download template")}
      </button>
      <div className="mb-4">
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
          className="text-sm"
        />
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mb-4 space-y-1 border-l-2 border-slate-800 pl-3 text-sm">
          <p>{t("Reports created: {n}", { n: result.created })}</p>
          <p>{t("Reports updated: {n}", { n: result.updated })}</p>
          <p>{t("Values added: {n}", { n: result.values_added })}</p>
          <p>{t("Duplicate values skipped: {n}", { n: result.values_skipped_duplicate })}</p>
          {result.unknown_columns.length > 0 && (
            <p className="text-amber-700">
              {t("Unknown columns (ignored)")}: {result.unknown_columns.join(", ")}
            </p>
          )}
          {result.skipped_rows.length > 0 && (
            <div className="text-red-700">
              <p>{t("Skipped rows: {n}", { n: result.skipped_rows.length })}</p>
              <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                {result.skipped_rows.map((s, i) => (
                  <li key={i}>
                    {t("Row {n}", { n: s.row })}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm">
          {t("Close")}
        </button>
        <button onClick={upload} disabled={!file || busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
          {busy ? t("Importing...") : t("Import")}
        </button>
      </div>
    </Modal>
  );
}

function MatchModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [prefix, setPrefix] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await apiClient.post<MatchResult>(`/projects/${projectId}/reports/match-oss`, {
        prefix,
        overwrite,
        dry_run: dryRun,
      });
      setResult(res.data);
    } catch (err) {
      setError(errorText(err, t("Matching failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("Match OSS files")} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        {t("Match reports without a link to files in the storage bucket by file name. Preview first, then apply.")}
      </p>
      <div className="mb-3">
        <label className="mb-1 block text-sm text-gray-600">{t("Object prefix")}</label>
        <input
          value={prefix}
          onChange={(e) => {
            setPrefix(e.target.value);
            setResult(null);
          }}
          placeholder="reports/"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => {
            setOverwrite(e.target.checked);
            setResult(null);
          }}
        />
        {t("Also overwrite reports that already have a link")}
      </label>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mb-4 space-y-3 text-sm">
          {result.applied && <p className="rounded bg-green-50 p-2 text-green-700">{t("Applied.")}</p>}
          <div>
            <p className="font-medium">{t("Matched: {n}", { n: result.matched.length })}</p>
            <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-gray-600">
              {result.matched.map((m) => (
                <li key={m.report_id}>
                  {m.report_name} {"->"} {m.key}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">{t("Ambiguous: {n}", { n: result.ambiguous.length })}</p>
            <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-gray-600">
              {result.ambiguous.map((m, i) => (
                <li key={i}>
                  {m.report_name}: {m.keys.join(", ")}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">{t("Unmatched reports: {n}", { n: result.unmatched_reports.length })}</p>
            <ul className="max-h-24 list-disc overflow-y-auto pl-5 text-xs text-gray-600">
              {result.unmatched_reports.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">{t("Unmatched files: {n}", { n: result.unmatched_objects.length })}</p>
            <ul className="max-h-24 list-disc overflow-y-auto pl-5 text-xs text-gray-600">
              {result.unmatched_objects.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm">
          {t("Close")}
        </button>
        <button onClick={() => run(true)} disabled={busy} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-50">
          {t("Preview")}
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy || !result || result.applied || result.matched.length === 0}
          className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t("Apply")}
        </button>
      </div>
    </Modal>
  );
}
