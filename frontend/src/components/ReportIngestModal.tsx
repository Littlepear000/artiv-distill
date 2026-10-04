import { ChangeEvent, FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

type Tab = "folder" | "links" | "single";

interface IngestItem {
  name: string;
  action: "created" | "overridden";
}
interface Summary {
  created: number;
  overridden: number;
  skipped: number;
  invalid: { line: number; text: string; reason: string }[];
}

const BATCH = 8;
const btnSecondary = "whitespace-nowrap shrink-0 rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-50";
const btnPrimary = "whitespace-nowrap shrink-0 rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50";
const inputCls = "w-full rounded border border-gray-300 px-3 py-2 text-sm";

function errorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string })?.msg ?? "").filter(Boolean).join("; ") || fallback;
  return fallback;
}

const dash = (n: number) => (n ? String(n) : "—");

export default function ReportIngestModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("folder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  // folder
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);

  // links
  const [text, setText] = useState("");
  const lineCount = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).length, [text]);

  // single
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function switchTab(next: Tab) {
    if (busy) return;
    setTab(next);
    setError("");
    setSummary(null);
  }

  function pickFolder(e: ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    const p = all.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setPdfs(p);
    setIgnored(all.length - p.length);
    setSummary(null);
    setProgress(0);
  }

  async function uploadFolder() {
    if (!pdfs.length) return;
    setBusy(true);
    setError("");
    setSummary(null);
    cancelRef.current = false;
    const acc: Summary = { created: 0, overridden: 0, skipped: ignored, invalid: [] };
    let done = 0;
    try {
      for (let i = 0; i < pdfs.length; i += BATCH) {
        if (cancelRef.current) break;
        const fd = new FormData();
        for (const f of pdfs.slice(i, i + BATCH)) fd.append("files", f, f.name);
        const res = await apiClient.post<{ created: number; overridden: number; skipped_non_pdf: number; items: IngestItem[] }>(
          `/projects/${projectId}/reports/upload-files`,
          fd,
        );
        acc.created += res.data.created;
        acc.overridden += res.data.overridden;
        acc.skipped += res.data.skipped_non_pdf;
        done = Math.min(pdfs.length, i + BATCH);
        setProgress(done);
      }
      if (cancelRef.current) setError(t("Upload cancelled. {n} of {m} files were uploaded.", { n: done, m: pdfs.length }));
    } catch (err) {
      setError(errorText(err, t("Upload failed")));
    } finally {
      setSummary(acc);
      setBusy(false);
    }
  }

  async function submitLinks() {
    if (!lineCount || busy) return;
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const res = await apiClient.post<{
        created: number;
        overridden: number;
        invalid: { line: number; text: string; reason: string }[];
      }>(`/projects/${projectId}/reports/upload-links`, { text });
      setSummary({ created: res.data.created, overridden: res.data.overridden, skipped: 0, invalid: res.data.invalid });
    } catch (err) {
      setError(errorText(err, t("Upload failed")));
    } finally {
      setBusy(false);
    }
  }

  function onLinksKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitLinks();
    }
  }

  async function submitSingle(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiClient.post<{ id: string }>(`/projects/${projectId}/reports`, {
        name: name.trim(),
        source_url: url.trim() || null,
      });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await apiClient.post(`/projects/${projectId}/reports/${res.data.id}/file`, fd);
      }
      setSummary({ created: 1, overridden: 0, skipped: 0, invalid: [] });
      setName("");
      setUrl("");
      setFile(null);
    } catch (err) {
      setError(errorText(err, t("Failed to add report")));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "folder", label: t("Folder") },
    { id: "links", label: t("Links") },
    { id: "single", label: t("Single") },
  ];
  const finished = summary !== null && !busy;
  const pct = pdfs.length ? Math.round((progress / pdfs.length) * 100) : 0;

  function close() {
    if (busy) return;
    if (summary && (summary.created || summary.overridden)) onDone();
    else onClose();
  }

  return (
    // No backdrop-click close: this is a form modal.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="page-title text-lg">{t("Add reports")}</h2>
          <button onClick={close} disabled={busy} aria-label={t("Close")} className="shrink-0 px-1 text-xl leading-none text-gray-500 hover:text-gray-800 disabled:opacity-40">
            ×
          </button>
        </div>

        <div className="mb-3 flex gap-5 border-b border-gray-200">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => switchTab(x.id)}
              className={`-mb-px whitespace-nowrap border-b-2 pb-2 text-sm ${
                tab === x.id ? "border-slate-800 font-medium text-slate-800" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <p className="mb-4 text-xs text-gray-500">{t("Reports with the same name are overridden")}</p>

        {tab === "folder" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {t("Pick a folder on this computer. Your browser reads its PDFs and uploads them; a typed local path cannot be read by the server.")}
            </p>
            <input
              type="file"
              // @ts-expect-error non-standard directory picker attribute
              webkitdirectory=""
              multiple
              disabled={busy}
              onChange={pickFolder}
              className="text-sm"
            />
            {(pdfs.length > 0 || ignored > 0) && (
              <p className="text-sm text-gray-700">
                {t("{n} PDFs found", { n: pdfs.length })}
                {ignored > 0 && <span className="text-gray-400"> · {t("{n} non-PDF ignored", { n: ignored })}</span>}
              </p>
            )}
            {busy && (
              <div>
                <div className="h-1.5 w-full bg-gray-100">
                  <div className="h-1.5 bg-slate-800" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-500">{t("Uploading {n} / {m}", { n: progress, m: pdfs.length })}</p>
              </div>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">{t("One per line: URL, or name | URL. http, https, oss and s3 links are accepted.")}</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onLinksKey}
              rows={8}
              disabled={busy}
              placeholder={"https://example.com/annual-report.pdf\nAnnual report 2023 | oss://bucket/reports/2023.pdf"}
              className={`${inputCls} font-mono text-xs`}
            />
            <p className="text-xs text-gray-400">
              {t("{n} lines", { n: lineCount })} · {t("Ctrl/Cmd+Enter to submit")}
            </p>
          </div>
        )}

        {tab === "single" && (
          <form onSubmit={submitSingle} id="single-form" className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("Name")}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("Link (optional)")}</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("PDF file (optional)")}</label>
              <input type="file" accept=".pdf,application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </div>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {finished && summary && (
          <div className="mt-4 border-l-2 border-slate-800 pl-3 text-sm text-gray-700">
            <p className="font-medium">{t("Done")}</p>
            <p>
              {t("Created")}: {dash(summary.created)} · {t("Overridden")}: {dash(summary.overridden)} · {t("Skipped")}: {dash(summary.skipped)}
            </p>
            {summary.invalid.length > 0 && (
              <div className="mt-1 text-red-700">
                <p>{t("Invalid lines: {n}", { n: summary.invalid.length })}</p>
                <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                  {summary.invalid.map((x, i) => (
                    <li key={i}>
                      {t("Line {n}", { n: x.line })}: {x.reason}
                      {x.text ? ` (${x.text.length > 60 ? x.text.slice(0, 60) + "…" : x.text})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {busy && tab === "folder" ? (
            <button onClick={() => (cancelRef.current = true)} className={btnSecondary}>
              {t("Cancel upload")}
            </button>
          ) : (
            <button onClick={close} disabled={busy} className={btnSecondary}>
              {finished ? t("Close") : t("Cancel")}
            </button>
          )}
          {tab === "folder" && (
            <button onClick={uploadFolder} disabled={busy || pdfs.length === 0} className={btnPrimary}>
              {busy ? t("Uploading...") : t("Upload {n} PDFs", { n: pdfs.length })}
            </button>
          )}
          {tab === "links" && (
            <button onClick={submitLinks} disabled={busy || lineCount === 0} className={btnPrimary}>
              {busy ? t("Uploading...") : t("Add {n} links", { n: lineCount })}
            </button>
          )}
          {tab === "single" && (
            <button type="submit" form="single-form" disabled={busy || !name.trim()} className={btnPrimary}>
              {busy ? t("Saving...") : t("Add report")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
