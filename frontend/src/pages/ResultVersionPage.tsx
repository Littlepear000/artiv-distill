import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import Drawer, { FieldList } from "../components/Drawer";
import { MergeSummary, SummaryView } from "../components/MergeModal";
import ResultTable, { orderColumns, ResultColumn, ResultRow } from "../components/ResultTable";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

interface VersionDetail {
  id: string;
  kind: string;
  label: string;
  source_filename: string | null;
  run_id: string | null;
  row_count: number;
  column_count: number;
  created_by_name: string | null;
  created_at: string;
  summary: Record<string, unknown> | null;
  columns: ResultColumn[];
  rows: { report_name: string; report_id: string | null; data: Record<string, string> }[];
  parents: { id: string; label: string }[];
}

export default function ResultVersionPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const base = `/projects/${projectId}`;
  const { t } = useI18n();
  const navigate = useNavigate();
  const [v, setV] = useState<VersionDetail | null>(null);
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        apiClient.get<VersionDetail>(`${base}/results/versions/${versionId}`),
        apiClient.get<{ my_role: string }>(base),
      ]);
      setV(r.data);
      setRole(p.data.my_role);
    } catch (e) {
      setError(errorMessage(e, t("Failed to load version")));
    }
  }, [base, versionId, t]);

  useEffect(() => {
    setV(null);
    setOpenIdx(null);
    load();
  }, [load]);

  const canEdit = role === "owner" || role === "editor";
  const columns = useMemo(() => orderColumns(v?.columns ?? []), [v]);
  const rows = useMemo<ResultRow[]>(() => (v?.rows ?? []).map((r, i) => ({ id: `${i}:${r.report_name}`, name: r.report_name, values: r.data })), [v]);
  const openRow = openIdx !== null ? rows[openIdx] : null;
  const back = `${base}/results?tab=versions`;

  async function apply() {
    if (!v) return;
    if (!window.confirm(t("Apply this version to the current results? Identical values are skipped and missing reports are created."))) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await apiClient.post<{ values_added: number; reports_created: number; skipped_columns: string[] }>(`${base}/results/versions/${v.id}/apply`);
      setNotice(
        t("Applied: {v} values added, {r} reports created, {s} columns skipped", {
          v: r.data.values_added,
          r: r.data.reports_created,
          s: r.data.skipped_columns.length,
        })
      );
    } catch (e) {
      setError(errorMessage(e, t("Action failed")));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!v || !window.confirm(t("Delete version \"{label}\"?", { label: v.label }))) return;
    try {
      await apiClient.delete(`${base}/results/versions/${v.id}`);
      navigate(back);
    } catch (e) {
      setError(errorMessage(e, t("Action failed")));
    }
  }

  const btn = "whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-40";
  const kindLabel = (k: string) => (k === "run" ? t("Run") : k === "upload" ? t("Upload") : k === "merge" ? t("Merge") : k === "snapshot" ? t("Snapshot") : k);

  const summary = v?.summary as Record<string, unknown> | null | undefined;
  const uploadRows: [string, unknown][] =
    v?.kind === "upload" && summary
      ? [
          [t("Fields created"), summary.fields_created],
          [t("Reports created"), summary.reports_created],
          [t("Reports updated"), summary.reports_updated],
          [t("Values added"), summary.values_added],
        ]
      : [];
  const listOf = (k: string) => (Array.isArray(summary?.[k]) ? (summary![k] as string[]) : []);

  return (
    <div className="p-6">
      <Link to={back} className="text-sm text-slate-600 underline">{t("Back to results")}</Link>
      {error && <p className="my-3 text-sm text-red-700">{error}</p>}
      {!v ? (
        !error && <p className="mt-3 text-sm text-gray-400">{t("Loading...")}</p>
      ) : (
        <>
          <div className="mb-4 mt-2 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="page-title truncate text-xl" title={v.label}>{v.label}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{kindLabel(v.kind)}</span>
                <span className="whitespace-nowrap">{v.created_by_name || "—"}</span>
                <span className="whitespace-nowrap">{new Date(v.created_at).toLocaleString()}</span>
                {v.source_filename && <span className="whitespace-nowrap">{v.source_filename}</span>}
                <span className="whitespace-nowrap">{t("{n} rows", { n: v.row_count })} · {t("{n} columns", { n: v.column_count })}</span>
                {v.parents.length > 0 && (
                  <span className="whitespace-nowrap">
                    {t("From")}:{" "}
                    {v.parents.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link to={`${base}/results/versions/${p.id}`} className="underline">{p.label}</Link>
                      </span>
                    ))}
                  </span>
                )}
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-3">
                <button className={btn} disabled={busy} onClick={apply}>{t("Apply to current results")}</button>
                <button className={`${btn} text-red-600`} onClick={remove}>{t("Delete version")}</button>
              </div>
            )}
          </div>

          {notice && <p className="mb-3 border-l-2 border-emerald-500 pl-3 text-sm text-slate-800">{notice}</p>}

          {v.kind === "merge" && summary && (
            <div className="mb-5 max-w-xl">
              <SummaryView s={summary as unknown as MergeSummary} />
            </div>
          )}
          {v.kind === "upload" && summary && (
            <div className="mb-5 text-sm">
              <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                {uploadRows.map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd>{typeof val === "number" && val ? val : "—"}</dd>
                  </div>
                ))}
              </dl>
              {listOf("skipped_columns").length > 0 && (
                <p className="mt-2 text-xs text-gray-500">{t("Skipped columns")}: {listOf("skipped_columns").join(", ")}</p>
              )}
              {listOf("missing_fields").length > 0 && (
                <p className="mt-1 text-xs text-gray-500">{t("Missing fields")}: {listOf("missing_fields").join(", ")}</p>
              )}
            </div>
          )}

          <ResultTable columns={columns} rows={rows} activeId={openRow?.id} onRowClick={(_, i) => setOpenIdx(i)} emptyText={t("No reports")} />

          <Drawer
            open={openIdx !== null && !!openRow}
            onClose={() => setOpenIdx(null)}
            title={openRow?.name ?? ""}
            actions={
              <>
                <button disabled={openIdx === null || openIdx <= 0} onClick={() => setOpenIdx((i) => (i === null ? i : i - 1))} className="px-1 text-gray-600 disabled:opacity-30" title={t("Previous")}>↑</button>
                <button disabled={openIdx === null || openIdx >= rows.length - 1} onClick={() => setOpenIdx((i) => (i === null ? i : i + 1))} className="px-1 text-gray-600 disabled:opacity-30" title={t("Next")}>↓</button>
              </>
            }
          >
            {openRow && (
              <FieldList items={columns.map((c) => ({ key: c.key, label: c.label, group_name: c.group_name, value: openRow.values[c.key] ?? "" }))} />
            )}
          </Drawer>
        </>
      )}
    </div>
  );
}
