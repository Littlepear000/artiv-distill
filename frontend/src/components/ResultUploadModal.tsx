import { useRef, useState } from "react";
import apiClient from "../api/client";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

interface Preview {
  filename: string;
  row_count: number;
  name_column: string | null;
  url_column: string | null;
  matched: { header: string; field_key: string; field_label: string }[];
  unmatched: { header: string; suggested_label: string; suggested_type: string; samples: string[] }[];
  missing_fields: { key: string; label: string; group_name: string | null }[];
}

interface NewField {
  add: boolean;
  label: string;
  data_type: string;
  group_name: string;
}

interface CommitResult {
  version_id: string;
  fields_created: number;
  reports_created: number;
  reports_updated: number;
  values_added: number;
  rows: number;
}

const DATA_TYPES = ["text", "number", "percent", "date", "year"];

interface Props {
  base: string;
  groups: string[];
  onClose: () => void;
  onDone: () => void;
}

export default function ResultUploadModal({ base, groups, onClose, onDone }: Props) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nameColumn, setNameColumn] = useState("");
  const [needName, setNeedName] = useState(false);
  const [fieldsState, setFieldsState] = useState<Record<string, NewField>>({});
  const [apply, setApply] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);

  async function runPreview(f: File, col?: string) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (col) fd.append("name_column", col);
      const r = await apiClient.post<Preview>(`${base}/results/upload/preview`, fd);
      setPreview(r.data);
      setNeedName(false);
      setNameColumn(r.data.name_column ?? col ?? "");
      const st: Record<string, NewField> = {};
      for (const u of r.data.unmatched) {
        st[u.header] = { add: true, label: u.suggested_label, data_type: u.suggested_type || "text", group_name: "" };
      }
      setFieldsState(st);
    } catch (e) {
      const msg = errorMessage(e, t("Could not read the file"));
      setError(msg);
      if (/name column/i.test(msg)) setNeedName(true);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    setNeedName(false);
    setNameColumn("");
    setError("");
    if (f) runPreview(f);
  }

  async function commit() {
    if (!file || !preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const mappings: Record<string, unknown> = {};
      for (const m of preview.matched) mappings[m.header] = { action: "map", field_key: m.field_key };
      for (const u of preview.unmatched) {
        const s = fieldsState[u.header];
        mappings[u.header] =
          s && s.add && s.label.trim()
            ? { action: "create", label: s.label.trim(), data_type: s.data_type, group_name: s.group_name.trim() || null }
            : { action: "skip" };
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "options",
        JSON.stringify({ label: label.trim() || undefined, name_column: nameColumn || undefined, mappings, apply_to_current: apply })
      );
      const r = await apiClient.post<CommitResult>(`${base}/results/upload/commit`, fd);
      setResult(r.data);
      onDone();
    } catch (e) {
      setError(errorMessage(e, t("Upload failed")));
    } finally {
      setBusy(false);
    }
  }

  const btn = "whitespace-nowrap rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50";
  const primary = "whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50";
  const input = "rounded border border-gray-300 px-2 py-1 text-sm";
  const select = "select-chevron rounded border border-gray-300 py-1 pl-2 pr-7 text-sm";
  const h3 = "mb-1 border-l-2 border-slate-400 pl-2 text-xs font-semibold uppercase tracking-wide text-gray-500";

  const newCount = preview ? preview.unmatched.filter((u) => fieldsState[u.header]?.add).length : 0;
  const patch = (h: string, p: Partial<NewField>) => setFieldsState((s) => ({ ...s, [h]: { ...s[h], ...p } }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded bg-white shadow-lg">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-medium text-slate-800">{t("Upload previous results")}</h2>
          <button onClick={onClose} aria-label={t("Close")} className="px-1 text-xl leading-none text-gray-500 hover:text-gray-800">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {result ? (
            <div className="text-sm">
              <p className="mb-3 border-l-2 border-emerald-500 pl-3 text-slate-800">{t("Upload complete")}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                <dt className="text-gray-500">{t("Rows in file")}</dt><dd>{result.rows || "—"}</dd>
                <dt className="text-gray-500">{t("Fields created")}</dt><dd>{result.fields_created || "—"}</dd>
                <dt className="text-gray-500">{t("Reports created")}</dt><dd>{result.reports_created || "—"}</dd>
                <dt className="text-gray-500">{t("Reports updated")}</dt><dd>{result.reports_updated || "—"}</dd>
                <dt className="text-gray-500">{t("Values added")}</dt><dd>{result.values_added || "—"}</dd>
              </dl>
              <p className="mt-3 text-xs text-gray-500">{t("The file was also saved as a version.")}</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500">
                {t("Upload an Excel or CSV of earlier results. One row per report (matched by report name), one column per field.")}
              </p>
              <div className="mb-4 flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className={btn}>{file ? t("Choose another file") : t("Choose file")}</button>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{file ? file.name : t("No file chosen (.xlsx or .csv)")}</span>
                {busy && !preview && <span className="whitespace-nowrap text-sm text-gray-400">{t("Reading…")}</span>}
              </div>

              {needName && file && (
                <form
                  className="mb-4 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (nameColumn.trim()) runPreview(file, nameColumn.trim());
                  }}
                >
                  <label className="whitespace-nowrap text-sm text-gray-600">{t("Report name column")}</label>
                  <input value={nameColumn} onChange={(e) => setNameColumn(e.target.value)} placeholder={t("Header text")} className={`${input} w-48`} />
                  <button type="submit" disabled={!nameColumn.trim() || busy} className={btn}>{t("Retry")}</button>
                </form>
              )}

              {preview && (
                <div>
                  <p className="mb-4 text-sm text-gray-600">
                    {t("{n} rows in {file}", { n: preview.row_count, file: preview.filename })}
                    {" · "}
                    {t("name column")}: <b>{preview.name_column ?? nameColumn}</b>
                  </p>

                  <section className="mb-5">
                    <h3 className={h3}>{t("Matched columns")} · {preview.matched.length || "—"}</h3>
                    {preview.matched.length === 0 ? (
                      <p className="py-1 text-sm text-gray-400">—</p>
                    ) : (
                      <ul className="max-h-40 overflow-y-auto text-sm">
                        {preview.matched.map((m) => (
                          <li key={m.header} className="flex items-center gap-2 border-b border-gray-100 py-1">
                            <span className="min-w-0 flex-1 truncate" title={m.header}>{m.header}</span>
                            <span className="text-gray-400">→</span>
                            <span className="min-w-0 flex-1 truncate text-slate-800" title={m.field_label}>{m.field_label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="mb-5">
                    <h3 className={h3}>{t("Unmatched columns")} · {preview.unmatched.length || "—"}</h3>
                    {preview.unmatched.length === 0 ? (
                      <p className="py-1 text-sm text-gray-400">—</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        <datalist id="result-upload-groups">
                          {groups.map((g) => <option key={g} value={g} />)}
                        </datalist>
                        {preview.unmatched.map((u) => {
                          const s = fieldsState[u.header];
                          if (!s) return null;
                          return (
                            <div key={u.header} className="border-b border-gray-100 py-2">
                              <div className="flex items-center gap-2">
                                <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-gray-700">
                                  <input type="checkbox" checked={s.add} onChange={(e) => patch(u.header, { add: e.target.checked })} />
                                  {t("Add as new field")}
                                </label>
                                <span className="min-w-0 flex-1 truncate text-sm text-gray-500" title={u.header}>
                                  {u.header}
                                  {u.samples.length > 0 && <span className="ml-2 text-xs text-gray-400">{u.samples.slice(0, 3).join(" · ")}</span>}
                                </span>
                              </div>
                              {s.add ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                                  <input value={s.label} onChange={(e) => patch(u.header, { label: e.target.value })} placeholder={t("Field label")} className={`${input} w-44`} />
                                  <select value={s.data_type} onChange={(e) => patch(u.header, { data_type: e.target.value })} className={select}>
                                    {DATA_TYPES.map((d) => <option key={d} value={d}>{t(d)}</option>)}
                                  </select>
                                  <input value={s.group_name} list="result-upload-groups" onChange={(e) => patch(u.header, { group_name: e.target.value })} placeholder={t("Group (optional)")} className={`${input} w-40`} />
                                </div>
                              ) : (
                                <p className="mt-1 pl-6 text-xs text-gray-400">{t("Skipped")}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="mb-5">
                    <h3 className={h3}>{t("Missing fields")} · {preview.missing_fields.length || "—"}</h3>
                    <p className="mb-1 text-xs text-gray-400">{t("Current fields that are not in the file; they stay unchanged.")}</p>
                    {preview.missing_fields.length > 0 && (
                      <p className="max-h-20 overflow-y-auto text-sm text-gray-600">{preview.missing_fields.map((m) => m.label).join(" · ")}</p>
                    )}
                  </section>

                  <section>
                    <label className="mb-3 flex items-center gap-2 whitespace-nowrap text-sm text-gray-700">
                      <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
                      {t("Also apply values to current results")}
                    </label>
                    <label className="mb-1 block text-xs text-gray-500">{t("Version label (optional)")}</label>
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), commit())}
                      placeholder={preview.filename}
                      className={`${input} w-full`}
                    />
                  </section>
                </div>
              )}
              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-3">
          {result ? (
            <button onClick={onClose} className={primary}>{t("Done")}</button>
          ) : (
            <>
              {preview && newCount > 0 && <span className="mr-auto text-xs text-gray-500">{t("{n} new fields will be created", { n: newCount })}</span>}
              <button onClick={onClose} className={btn}>{t("Cancel")}</button>
              <button onClick={commit} disabled={!preview || busy} className={primary}>
                {busy && preview ? t("Uploading…") : t("Confirm upload")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
