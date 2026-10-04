import { ChangeEvent, useState } from "react";
import apiClient from "../api/client";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

type DataType = "text" | "number" | "percent" | "date" | "year";

interface InferredColumn {
  header: string;
  kind: "name" | "url" | "field";
  label: string;
  key: string;
  data_type: DataType;
  samples: string[];
  exists: boolean;
  description?: string | null;
  group_name?: string | null;
}

interface Row extends InferredColumn {
  selected: boolean;
}

const DATA_TYPES: DataType[] = ["text", "number", "percent", "date", "year"];

/** 上传历史成果的 Excel/CSV → 按列名自动推断字段 → 预览确认 → 创建字段（可选同时导入历史数据）。 */
export default function FieldInferPanel({ base, onDone }: { base: string; onDone: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [importData, setImportData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function handleAnalyze(f: File) {
    setFile(f);
    setError("");
    setResult("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await apiClient.post<{ row_count: number; columns: InferredColumn[] }>(`${base}/report-fields/infer`, form);
      setRowCount(res.data.row_count);
      setRows(res.data.columns.map((c) => ({ ...c, selected: c.kind === "field" && !c.exists })));
    } catch (err) {
      setRows(null);
      setError(errorMessage(err, t("Could not read the file")));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyzeText() {
    if (!text.trim()) return;
    setFile(null);
    setError("");
    setResult("");
    setBusy(true);
    try {
      const res = await apiClient.post<{ row_count: number; columns: InferredColumn[] }>(`${base}/report-fields/infer-text`, { text });
      setRowCount(0);
      setRows(res.data.columns.map((c) => ({ ...c, selected: !c.exists })));
    } catch (err) {
      setRows(null);
      setError(errorMessage(err, t("Could not recognize fields")));
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleCreate() {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      const chosen = rows.filter((r) => r.selected && r.kind === "field");
      let created = 0;
      if (chosen.length > 0) {
        const res = await apiClient.post<unknown[]>(`${base}/report-fields/bulk`, {
          fields: chosen.map((r) => ({ label: r.label.trim() || r.header, data_type: r.data_type, description: r.description ?? null, group_name: r.group_name ?? null })),
        });
        created = res.data.length;
      }
      let msg = t("{n} fields created", { n: created });
      if (importData && file && rows.some((r) => r.kind === "name")) {
        const form = new FormData();
        form.append("file", file);
        const imp = await apiClient.post<{ created: number; updated: number; values_added: number }>(`${base}/reports/import`, form);
        msg += " · " + t("{reports} reports, {values} values imported", { reports: imp.data.created + imp.data.updated, values: imp.data.values_added });
      }
      setResult(msg);
      setRows(null);
      setFile(null);
      onDone();
    } catch (err) {
      setError(errorMessage(err, t("Action failed")));
    } finally {
      setBusy(false);
    }
  }

  const hasName = !!file && rows?.some((r) => r.kind === "name");
  const selectCls = "select-chevron rounded border border-gray-300 py-1 pl-2 pr-7 text-sm";

  return (
    <section className="mb-6 rounded border border-dashed border-slate-300 bg-white p-4">
      <h2 className="font-semibold">{t("Import fields from a past results file")}</h2>
      <p className="mb-3 mt-1 text-sm text-gray-500">
        {t("Upload an Excel/CSV of your earlier results, or paste messy headers and sample data. Columns become fields (types guessed from the values); name / url columns identify the reports. Pasted text is analyzed by DeepSeek when DEEPSEEK_API_KEY is set, otherwise split by tabs/commas.")}
      </p>
      <div className="mb-3 inline-flex overflow-hidden rounded border border-gray-300 text-sm">
        {(["file", "text"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 ${mode === m ? "bg-slate-800 text-white" : "hover:bg-gray-100"}`}>
            {m === "file" ? t("Upload file") : t("Paste text")}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <div>
          <input
            type="file"
            accept=".xlsx,.csv"
            disabled={busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && handleAnalyze(e.target.files[0])}
            className="text-sm"
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={t("Paste messy headers, sample rows or notes — in any format")}
            className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button disabled={busy || !text.trim()} onClick={handleAnalyzeText} className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? t("Analyzing…") : t("Recognize fields")}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}

      {rows && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-gray-600">{rowCount > 0 ? t("{n} data rows detected. Review the detected columns:", { n: rowCount }) : t("Review the recognized fields:")}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1 pr-2"></th>
                <th className="pr-2">{t("Column")}</th>
                <th className="pr-2">{t("Field label")}</th>
                <th className="pr-2">{t("Data type")}</th>
                <th>{t("Sample values")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 pr-2">
                    {r.kind === "field" ? <input type="checkbox" checked={r.selected} onChange={(e) => update(i, { selected: e.target.checked })} /> : null}
                  </td>
                  <td className="pr-2">
                    {r.header}
                    {r.kind !== "field" && <span className="ml-2 rounded bg-sky-100 px-1.5 text-xs text-sky-700">{r.kind === "name" ? t("Report name") : t("Report link")}</span>}
                    {r.exists && <span className="ml-2 rounded bg-gray-100 px-1.5 text-xs text-gray-600">{t("already exists")}</span>}
                  </td>
                  <td className="pr-2">
                    {r.kind === "field" && <input value={r.label} onChange={(e) => update(i, { label: e.target.value })} className="rounded border border-gray-300 px-2 py-1" />}
                  </td>
                  <td className="pr-2">
                    {r.kind === "field" && (
                      <select value={r.data_type} onChange={(e) => update(i, { data_type: e.target.value as DataType })} className={selectCls}>
                        {DATA_TYPES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="max-w-xs truncate text-gray-500" title={r.samples.join(" | ")}>
                    {r.samples.join(" | ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {hasName && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={importData} onChange={(e) => setImportData(e.target.checked)} />
                {t("Also import the rows as historical values")}
              </label>
            )}
            <button disabled={busy} onClick={handleCreate} className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
              {t("Create fields")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
