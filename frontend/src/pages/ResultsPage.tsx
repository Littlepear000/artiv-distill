import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import Drawer, { FieldList } from "../components/Drawer";
import MergeModal, { VersionBrief } from "../components/MergeModal";
import ResultTable, { orderColumns, ResultColumn, ResultRow } from "../components/ResultTable";
import ResultUploadModal from "../components/ResultUploadModal";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

interface FieldRow extends ResultColumn {
  id: string;
}

interface ValueCell {
  value_id: string;
  value: string;
  source: string;
  is_pinned: boolean;
  history_count: number;
}

interface ReportRow {
  id: string;
  name: string;
  values: Record<string, ValueCell>;
}

interface VersionItem extends VersionBrief {
  source_filename: string | null;
  created_by_name: string | null;
}

const PAGE = 200;

export default function ResultsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const base = `/projects/${projectId}`;
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "versions" ? "versions" : "current";
  const setTab = (v: "current" | "versions") => setSp(v === "versions" ? { tab: "versions" } : {}, { replace: true });

  const [role, setRole] = useState("viewer");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [upload, setUpload] = useState(false);
  const [merge, setMerge] = useState<[VersionBrief, VersionBrief] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canEdit = role === "owner" || role === "editor";

  const loadCurrent = useCallback(async () => {
    const [proj, f] = await Promise.all([
      apiClient.get<{ my_role: string }>(base),
      apiClient.get<FieldRow[]>(`${base}/report-fields`),
    ]);
    setRole(proj.data.my_role);
    setFields(f.data);
    const all: ReportRow[] = [];
    let page = 1;
    for (;;) {
      const r = await apiClient.get<{ items: ReportRow[]; total: number }>(`${base}/reports`, { params: { page, page_size: PAGE } });
      all.push(...r.data.items);
      if (all.length >= r.data.total || r.data.items.length === 0) break;
      page += 1;
    }
    setReports(all);
  }, [base]);

  const loadVersions = useCallback(async () => {
    const r = await apiClient.get<VersionItem[]>(`${base}/results/versions`);
    setVersions(r.data);
    setSelected((s) => s.filter((id) => r.data.some((v) => v.id === id)));
  }, [base]);

  const reload = useCallback(async () => {
    setError("");
    try {
      await Promise.all([loadCurrent(), loadVersions()]);
    } catch (e) {
      setError(errorMessage(e, t("Failed to load results")));
    } finally {
      setLoading(false);
    }
  }, [loadCurrent, loadVersions, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const columns = useMemo(() => orderColumns(fields), [fields]);
  const groups = useMemo(() => Array.from(new Set(fields.map((f) => f.group_name).filter((g): g is string => !!g))), [fields]);

  const rows = useMemo<ResultRow[]>(() => {
    const q = search.trim().toLowerCase();
    return reports
      .map((r) => ({ id: r.id, name: r.name, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v.value])) }))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || Object.values(r.values).some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [reports, search]);

  const openRow = openIdx !== null ? rows[openIdx] : null;
  const openReport = openRow ? reports.find((r) => r.id === openRow.id) : null;

  async function snapshot() {
    const label = window.prompt(t("Snapshot label (optional)"), "");
    if (label === null) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.post(`${base}/results/versions/snapshot`, { label: label.trim() || undefined });
      await loadVersions();
      setTab("versions");
    } catch (e) {
      setError(errorMessage(e, t("Could not save snapshot")));
    } finally {
      setBusy(false);
    }
  }

  async function removeVersion(v: VersionItem) {
    if (!window.confirm(t("Delete version \"{label}\"?", { label: v.label }))) return;
    try {
      await apiClient.delete(`${base}/results/versions/${v.id}`);
      await loadVersions();
    } catch (e) {
      setError(errorMessage(e, t("Action failed")));
    }
  }

  function startMerge() {
    const two = versions.filter((v) => selected.includes(v.id));
    if (two.length !== 2) return;
    two.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setMerge([two[0], two[1]]);
  }

  const btn = "whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-gray-50 disabled:opacity-40";
  const tabCls = (on: boolean) =>
    `whitespace-nowrap border-b-2 px-1 pb-2 text-sm ${on ? "border-slate-800 font-medium text-slate-900" : "border-transparent text-gray-500 hover:text-gray-800"}`;

  const kindLabel = (k: string) => (k === "run" ? t("Run") : k === "upload" ? t("Upload") : k === "merge" ? t("Merge") : k === "snapshot" ? t("Snapshot") : k);
  const kindCls = (k: string) =>
    k === "run" ? "bg-sky-50 text-sky-700" : k === "upload" ? "bg-amber-50 text-amber-700" : k === "merge" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700";

  return (
    <div className="p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-xl">{t("Results")}</h1>
      </div>
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        <button className={tabCls(tab === "current")} onClick={() => setTab("current")}>{t("Current results")}</button>
        <button className={tabCls(tab === "versions")} onClick={() => setTab("versions")}>
          {t("Versions")}
          {versions.length > 0 && <span className="ml-1.5 text-xs text-gray-400">{versions.length}</span>}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      {tab === "current" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search")}
              className="w-60 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="whitespace-nowrap text-xs text-gray-400">
              {t("{n} reports", { n: rows.length })} · {t("{n} fields", { n: columns.length })}
            </span>
            <div className="ml-auto flex items-center gap-3">
              {canEdit && <button className={btn} onClick={() => setUpload(true)}>{t("Upload previous results")}</button>}
              {canEdit && <button className={btn} disabled={busy} onClick={snapshot}>{t("Save snapshot")}</button>}
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">{t("Loading...")}</p>
          ) : columns.length === 0 ? (
            <p className="py-8 text-sm text-gray-500">
              {t("No result fields yet.")}{" "}
              <Link className="underline" to={`${base}/report-fields`}>{t("Define fields")}</Link>
            </p>
          ) : (
            <ResultTable
              columns={columns}
              rows={rows}
              activeId={openRow?.id}
              onRowClick={(_, i) => setOpenIdx(i)}
              emptyText={t("No reports")}
            />
          )}
        </>
      )}

      {tab === "versions" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {canEdit && (
              <button className={btn} disabled={selected.length !== 2} onClick={startMerge}>
                {t("Merge selected")}
              </button>
            )}
            <span className="whitespace-nowrap text-xs text-gray-400">{t("Select exactly two versions to merge")}</span>
          </div>
          {versions.length === 0 ? (
            <p className="py-8 text-sm text-gray-500">{t("No versions yet. Save a snapshot or upload previous results.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="w-8 py-2" />
                    <th className="whitespace-nowrap pr-3 font-medium">{t("Name")}</th>
                    <th className="whitespace-nowrap pr-3 font-medium">{t("Kind")}</th>
                    <th className="whitespace-nowrap pr-3 text-right font-medium">{t("Rows")}</th>
                    <th className="whitespace-nowrap pr-3 text-right font-medium">{t("Columns")}</th>
                    <th className="whitespace-nowrap pr-3 pl-3 font-medium">{t("Created by")}</th>
                    <th className="whitespace-nowrap pr-3 font-medium">{t("Created at")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(v.id)}
                          onChange={(e) => setSelected((s) => (e.target.checked ? [...s, v.id] : s.filter((x) => x !== v.id)))}
                        />
                      </td>
                      <td className="max-w-[24rem] truncate pr-3">
                        <Link to={`${base}/results/versions/${v.id}`} className="text-slate-800 underline decoration-gray-300 hover:decoration-slate-600" title={v.label}>
                          {v.label}
                        </Link>
                      </td>
                      <td className="pr-3">
                        <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${kindCls(v.kind)}`}>{kindLabel(v.kind)}</span>
                      </td>
                      <td className="pr-3 text-right tabular-nums">{v.row_count || "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{v.column_count || "—"}</td>
                      <td className="whitespace-nowrap pr-3 pl-3 text-gray-600">{v.created_by_name || "—"}</td>
                      <td className="whitespace-nowrap pr-3 text-gray-500">{new Date(v.created_at).toLocaleString()}</td>
                      <td className="whitespace-nowrap text-right">
                        {canEdit && (
                          <button onClick={() => removeVersion(v)} className="text-sm text-red-600 hover:underline">{t("Delete")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Drawer
        open={openIdx !== null && !!openRow}
        onClose={() => setOpenIdx(null)}
        title={openRow?.name ?? ""}
        actions={
          <>
            {openRow && (
              <Link to={`${base}/reports/${openRow.id}`} className="whitespace-nowrap text-slate-600 underline">{t("Open report")}</Link>
            )}
            <button disabled={openIdx === null || openIdx <= 0} onClick={() => setOpenIdx((i) => (i === null ? i : i - 1))} className="px-1 text-gray-600 disabled:opacity-30" title={t("Previous")}>↑</button>
            <button disabled={openIdx === null || openIdx >= rows.length - 1} onClick={() => setOpenIdx((i) => (i === null ? i : i + 1))} className="px-1 text-gray-600 disabled:opacity-30" title={t("Next")}>↓</button>
          </>
        }
      >
        {openReport && (
          <FieldList
            items={columns.map((c) => {
              const v = openReport.values[c.key];
              return {
                key: c.key,
                label: c.label,
                group_name: c.group_name,
                value: v?.value ?? "",
                source: v?.source ?? null,
                pinned: v?.is_pinned,
                historyCount: v?.history_count,
              };
            })}
          />
        )}
      </Drawer>

      {upload && (
        <ResultUploadModal
          base={base}
          groups={groups}
          onClose={() => setUpload(false)}
          onDone={() => {
            reload();
          }}
        />
      )}
      {merge && (
        <MergeModal
          base={base}
          a={merge[0]}
          b={merge[1]}
          onClose={() => {
            setMerge(null);
            setSelected([]);
          }}
          onMerged={loadVersions}
        />
      )}
    </div>
  );
}
