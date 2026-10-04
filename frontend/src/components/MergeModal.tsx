import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

export interface VersionBrief {
  id: string;
  label: string;
  kind: string;
  row_count: number;
  column_count: number;
  created_at: string;
}

export interface MergeSummary {
  on_conflict: "other" | "base";
  columns: { base: number; other: number; merged: number; duplicate: number; only_base: string[]; only_other: string[] };
  rows: { base: number; other: number; merged: number; matched: number; only_base: number; only_other: number };
  conflicts: {
    cells: number;
    rows: number;
    examples: { report_name: string; field_label: string; base_value: string; other_value: string }[];
  };
}

const n = (v: number) => (v ? v : "—");

export function SummaryView({ s }: { s: MergeSummary }) {
  const { t } = useI18n();
  const th = "whitespace-nowrap px-3 py-1.5 text-right text-xs font-medium text-gray-500";
  const td = "px-3 py-1.5 text-right tabular-nums";
  const lab = "whitespace-nowrap py-1.5 pr-3 text-left text-gray-600";
  return (
    <div className="text-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th />
            <th className={th}>A</th>
            <th className={th}>B</th>
            <th className={th}>{t("Merged")}</th>
            <th className={th}>{t("Duplicate")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className={lab}>{t("Columns")}</td>
            <td className={td}>{n(s.columns.base)}</td>
            <td className={td}>{n(s.columns.other)}</td>
            <td className={`${td} font-semibold text-slate-900`}>{n(s.columns.merged)}</td>
            <td className={td}>{n(s.columns.duplicate)}</td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className={lab}>{t("Rows")}</td>
            <td className={td}>{n(s.rows.base)}</td>
            <td className={td}>{n(s.rows.other)}</td>
            <td className={`${td} font-semibold text-slate-900`}>{n(s.rows.merged)}</td>
            <td className={td}>{n(s.rows.matched)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">
        {t("Rows only in A: {a} · only in B: {b}", { a: s.rows.only_base || "—", b: s.rows.only_other || "—" })}
      </p>
      {(s.columns.only_base.length > 0 || s.columns.only_other.length > 0) && (
        <p className="mt-1 text-xs text-gray-500">
          {s.columns.only_base.length > 0 && <span className="mr-3">{t("Columns only in A: {list}", { list: s.columns.only_base.join(", ") })}</span>}
          {s.columns.only_other.length > 0 && <span>{t("Columns only in B: {list}", { list: s.columns.only_other.join(", ") })}</span>}
        </p>
      )}
      <div className="mt-3 border-l-2 border-amber-400 pl-3">
        <p className="text-slate-800">
          {s.conflicts.cells
            ? t("{cells} conflicting cells in {rows} rows", { cells: s.conflicts.cells, rows: s.conflicts.rows })
            : t("No conflicts")}
        </p>
        {s.conflicts.examples.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2 font-medium">{t("Report")}</th>
                  <th className="pr-2 font-medium">{t("Field")}</th>
                  <th className="pr-2 font-medium">A</th>
                  <th className="font-medium">B</th>
                </tr>
              </thead>
              <tbody>
                {s.conflicts.examples.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="max-w-[10rem] truncate py-1 pr-2" title={e.report_name}>{e.report_name}</td>
                    <td className="max-w-[8rem] truncate pr-2" title={e.field_label}>{e.field_label}</td>
                    <td className="max-w-[8rem] truncate pr-2" title={e.base_value}>{e.base_value || "—"}</td>
                    <td className="max-w-[8rem] truncate" title={e.other_value}>{e.other_value || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  base: string; // /projects/{id}
  a: VersionBrief; // older (base)
  b: VersionBrief; // newer (other)
  onClose: () => void;
  onMerged: () => void;
}

export default function MergeModal({ base, a, b, onClose, onMerged }: Props) {
  const { t } = useI18n();
  const [onConflict, setOnConflict] = useState<"other" | "base">("other");
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<MergeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ version_id: string; summary: MergeSummary } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .post<MergeSummary>(`${base}/results/versions/merge/preview`, { base_id: a.id, other_id: b.id, on_conflict: onConflict })
      .then((r) => !cancelled && setPreview(r.data))
      .catch((e) => !cancelled && setError(errorMessage(e, t("Could not compute the merge preview"))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [base, a.id, b.id, onConflict, t]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiClient.post<{ version_id: string; summary: MergeSummary }>(`${base}/results/versions/merge`, {
        base_id: a.id,
        other_id: b.id,
        on_conflict: onConflict,
        label: label.trim() || undefined,
      });
      setResult(r.data);
      onMerged();
    } catch (e) {
      setError(errorMessage(e, t("Merge failed")));
    } finally {
      setBusy(false);
    }
  }

  const btn = "whitespace-nowrap rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-gray-50";
  const primary = "whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50";

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded bg-white p-5 shadow-lg">
          <h2 className="mb-3 text-lg font-medium text-slate-800">{t("Merge complete")}</h2>
          <SummaryView s={result.summary} />
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={onClose} className={btn}>{t("Close")}</button>
            <Link to={`${base}/results/versions/${result.version_id}`} className={primary}>
              {t("Open merged version")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-800">{t("Merge versions")}</h2>
          <button onClick={onClose} aria-label={t("Cancel")} className="px-1 text-xl leading-none text-gray-500 hover:text-gray-800">×</button>
        </div>

        <dl className="mb-4 text-sm">
          {[{ k: "A", v: a, hint: t("older") }, { k: "B", v: b, hint: t("newer") }].map(({ k, v, hint }) => (
            <div key={k} className="flex items-baseline gap-3 border-b border-gray-100 py-1.5">
              <dt className="w-5 shrink-0 font-semibold text-slate-700">{k}</dt>
              <dd className="min-w-0 flex-1 truncate" title={v.label}>{v.label}</dd>
              <dd className="shrink-0 whitespace-nowrap text-xs text-gray-400">
                {hint} · {new Date(v.created_at).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>

        <label className="mb-1 block text-xs text-gray-500">{t("When both have different values")}</label>
        <select
          value={onConflict}
          onChange={(e) => setOnConflict(e.target.value as "other" | "base")}
          className="select-chevron mb-4 w-full rounded border border-gray-300 py-1.5 pl-2 pr-7 text-sm"
        >
          <option value="other">{t("Use newer (B)")}</option>
          <option value="base">{t("Keep older (A)")}</option>
        </select>

        <div className="mb-4 min-h-[7rem]">
          {loading && <p className="text-sm text-gray-400">{t("Loading...")}</p>}
          {!loading && preview && <SummaryView s={preview} />}
        </div>

        <label className="mb-1 block text-xs text-gray-500">{t("Label (optional)")}</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), preview && confirm())}
          placeholder={t("Merge: {a} + {b}", { a: a.label, b: b.label })}
          className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />

        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className={btn}>{t("Cancel")}</button>
          <button onClick={confirm} disabled={busy || loading || !preview} className={primary}>
            {busy ? t("Merging…") : t("Confirm merge")}
          </button>
        </div>
      </div>
    </div>
  );
}
