import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";
import FieldInferPanel from "../components/FieldInferPanel";
import { useI18n } from "../i18n";

type DataType = "text" | "number" | "percent" | "date" | "year";
type AutoSelect = "latest" | "system_first";

interface FieldRow {
  id: string;
  key: string;
  label: string;
  data_type: DataType;
  description: string | null;
  allow_import: boolean;
  allow_extract: boolean;
  auto_select: AutoSelect;
  group_name: string | null;
  position: number;
}

const DATA_TYPES: DataType[] = ["text", "number", "percent", "date", "year"];

function errorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}

export default function ReportFieldsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useI18n();
  const base = `/projects/${projectId}`;

  const [role, setRole] = useState<string>("viewer");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [error, setError] = useState("");
  const [grouping, setGrouping] = useState(false);

  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [dataType, setDataType] = useState<DataType>("text");
  const [description, setDescription] = useState("");
  const [allowImport, setAllowImport] = useState(true);
  const [allowExtract, setAllowExtract] = useState(true);
  const [autoSelect, setAutoSelect] = useState<AutoSelect>("system_first");
  const [newGroup, setNewGroup] = useState("");
  const [creatingGroupFor, setCreatingGroupFor] = useState<string | null>(null);
  const [creatingGroupName, setCreatingGroupName] = useState("");

  const load = useCallback(async () => {
    const [projRes, fieldsRes] = await Promise.all([
      apiClient.get<{ my_role: string }>(base),
      apiClient.get<FieldRow[]>(`${base}/report-fields`),
    ]);
    setRole(projRes.data.my_role);
    setFields(fieldsRes.data);
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = role === "owner" || role === "editor";
  const canDelete = canEdit;

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err, t("Action failed")));
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    await run(async () => {
      await apiClient.post(`${base}/report-fields`, {
        label: label.trim(),
        key: key.trim() || undefined,
        data_type: dataType,
        description: description.trim() || null,
        allow_import: allowImport,
        allow_extract: allowExtract,
        auto_select: autoSelect,
        group_name: newGroup.trim() || null,
      });
      setNewGroup("");
      setLabel("");
      setKey("");
      setDataType("text");
      setDescription("");
      setAllowImport(true);
      setAllowExtract(true);
      setAutoSelect("system_first");
    });
  }

  function patch(f: FieldRow, body: Partial<FieldRow>) {
    // optimistic local update for text inputs is avoided; patch then reload
    return run(() => apiClient.patch(`${base}/report-fields/${f.id}`, body));
  }

  // 按分组切段（组的顺序 = 组内最靠前字段的顺序；未分组放最后）
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, FieldRow[]>();
    for (const f of fields) {
      const g = f.group_name ?? "";
      if (!map.has(g)) {
        map.set(g, []);
        if (g) order.push(g);
      }
      map.get(g)!.push(f);
    }
    if (map.has("")) order.push("");
    return order.map((g) => ({ name: g, items: map.get(g)! }));
  }, [fields]);
  const groupNames = sections.map((s) => s.name).filter(Boolean);

  function submitOrder(secs: { items: FieldRow[] }[]) {
    const ids = secs.flatMap((sec) => sec.items.map((f) => f.id));
    return run(() => apiClient.post(`${base}/report-fields/reorder`, { ids }));
  }

  function moveField(si: number, i: number, delta: number) {
    const secs = sections.map((sec) => ({ ...sec, items: [...sec.items] }));
    const items = secs[si].items;
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    submitOrder(secs);
  }

  function moveGroup(si: number, delta: number) {
    const j = si + delta;
    if (j < 0 || j >= sections.length) return;
    const secs = [...sections];
    [secs[si], secs[j]] = [secs[j], secs[si]];
    submitOrder(secs);
  }

  function setGroup(f: FieldRow, value: string) {
    if (value === "__new__") {
      setCreatingGroupFor(f.id);
      setCreatingGroupName("");
      return;
    }
    return patch(f, { group_name: value || null });
  }

  function commitNewGroup(f: FieldRow) {
    const name = creatingGroupName.trim();
    setCreatingGroupFor(null);
    if (name) return patch(f, { group_name: name });
  }

  function renameGroup(oldName: string, next: string) {
    return run(() => apiClient.post(`${base}/report-fields/groups/rename`, { old: oldName, new: next.trim() || null }));
  }

  async function autoGroup(onlyUngrouped: boolean) {
    if (!onlyUngrouped && !window.confirm(t("Regroup ALL fields with AI? Existing groups will be replaced."))) return;
    setGrouping(true);
    await run(() => apiClient.post(`${base}/report-fields/auto-group`, { only_ungrouped: onlyUngrouped }));
    setGrouping(false);
  }

  function remove(f: FieldRow) {
    if (!window.confirm(t("Delete field \"{label}\"? All its stored values will be deleted too.", { label: f.label }))) return;
    run(() => apiClient.delete(`${base}/report-fields/${f.id}`));
  }

  const inputCls = "rounded border border-gray-300 px-2 py-1.5 text-sm";
  const selectCls = "select-chevron rounded border border-gray-300 py-1.5 pl-2 pr-7 text-sm";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to={`${base}/results`} className="text-sm text-slate-600 underline">
        {t("Back to results")}
      </Link>
      <h1 className="page-title mb-2 mt-2 text-xl">{t("Result fields")}</h1>
      <p className="mb-2 text-sm text-gray-500">
        {t("Define which parsed values are tracked for every report. Each field keeps a history of values from different sources.")}
      </p>
      <p className="mb-5 text-xs text-gray-400">
        {t("Auto-select policy: \"System first\" uses the newest system-parsed value and falls back to the newest value of any source; \"Latest\" always uses the newest value regardless of source. A value you pin manually is never overridden.")}
      </p>

      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {!canEdit && <p className="mb-3 text-sm text-amber-700">{t("Only owners and editors can change result fields.")}</p>}

      {canEdit && fields.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button disabled={grouping} onClick={() => autoGroup(true)} className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
            {grouping ? t("Grouping…") : t("✨ Auto-group with AI")}
          </button>
          <button disabled={grouping} onClick={() => autoGroup(false)} className="text-sm text-slate-600 underline disabled:opacity-50">
            {t("Regroup all")}
          </button>
          <span className="text-xs text-gray-400">{t("AI only suggests groups — rename, move or regroup anything afterwards.")}</span>
        </div>
      )}

      {canEdit && <FieldInferPanel base={base} onDone={load} />}

      {canEdit && (
        <form onSubmit={handleAdd} className="mb-6 rounded border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-3 font-medium text-slate-800">{t("Add field")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t("Label")}</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inputCls} w-40`} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t("Key (optional, cannot change later)")}</label>
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("auto from label")} className={`${inputCls} w-44`} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t("Data type")}</label>
              <select value={dataType} onChange={(e) => setDataType(e.target.value as DataType)} className={selectCls}>
                {DATA_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {t(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[14rem] flex-1">
              <label className="mb-1 block text-xs text-gray-500">{t("Description / extraction hint")}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t("Auto-select policy")}</label>
              <select value={autoSelect} onChange={(e) => setAutoSelect(e.target.value as AutoSelect)} className={selectCls}>
                <option value="system_first">{t("System first")}</option>
                <option value="latest">{t("Latest")}</option>
              </select>
            </div>
            <label className="flex items-center gap-1 whitespace-nowrap pb-2 text-sm text-gray-600">
              <input type="checkbox" checked={allowImport} onChange={(e) => setAllowImport(e.target.checked)} />
              {t("Enable import")}
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap pb-2 text-sm text-gray-600">
              <input type="checkbox" checked={allowExtract} onChange={(e) => setAllowExtract(e.target.checked)} />
              {t("Enable system extraction")}
            </label>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t("Group")}</label>
              <input list="group-options" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder={t("optional")} className={`${inputCls} w-36`} />
              <datalist id="group-options">
                {groupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <button type="submit" disabled={!label.trim()} className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
              {t("Add field")}
            </button>
          </div>
        </form>
      )}

      <p className="mb-2 text-xs text-gray-500">{t("Click any label or description to rename it — changes save when you press Enter or leave the cell.")}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-2">{t("Label")}</th>
              <th className="pr-2">{t("Key")}</th>
              <th className="pr-2">{t("Group")}</th>
              <th className="pr-2">{t("Data type")}</th>
              <th className="pr-2">{t("Description / extraction hint")}</th>
              <th className="pr-2">{t("Enable import")}</th>
              <th className="pr-2">{t("Enable system extraction")}</th>
              <th className="pr-2">{t("Auto-select policy")}</th>
              <th className="sticky right-0 bg-white"></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, si) => (
              <Fragment key={sec.name || "__ungrouped__"}>
                <tr className="bg-slate-100">
                  <td colSpan={9} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {sec.name ? (
                        <TextCell value={sec.name} disabled={!canEdit} onCommit={(v) => renameGroup(sec.name, v)} className={`${inputCls} w-48 bg-white font-semibold`} />
                      ) : (
                        <span className="font-semibold text-gray-500">{t("Ungrouped")}</span>
                      )}
                      <span className="text-xs text-gray-500">{t("{n} fields", { n: sec.items.length })}</span>
                      {canEdit && sec.name && (
                        <>
                          <button disabled={si === 0} onClick={() => moveGroup(si, -1)} title={t("Move group up")} className="px-1.5 text-gray-600 disabled:opacity-30">↑</button>
                          <button disabled={!sections[si + 1]?.name} onClick={() => moveGroup(si, 1)} title={t("Move group down")} className="px-1.5 text-gray-600 disabled:opacity-30">↓</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {sec.items.map((f, i) => (
              <tr key={f.id} className="border-b border-gray-100 align-top">
                <td className="py-2 pr-2">
                  <TextCell value={f.label} disabled={!canEdit} onCommit={(v) => v.trim() && patch(f, { label: v.trim() })} className={`${inputCls} w-36`} />
                </td>
                <td className="pr-2 pt-3 font-mono text-xs text-gray-500">{f.key}</td>
                <td className="pr-2">
                  {creatingGroupFor === f.id ? (
                    <input
                      autoFocus
                      value={creatingGroupName}
                      placeholder={t("New group name")}
                      onChange={(e) => setCreatingGroupName(e.target.value)}
                      onBlur={() => commitNewGroup(f)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setCreatingGroupFor(null);
                      }}
                      className={`${inputCls} w-32`}
                    />
                  ) : (
                    <select disabled={!canEdit} value={f.group_name ?? ""} onChange={(e) => setGroup(f, e.target.value)} className={selectCls}>
                      <option value="">{t("Ungrouped")}</option>
                      {groupNames.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                      <option value="__new__">+ {t("New group…")}</option>
                    </select>
                  )}
                </td>
                <td className="pr-2">
                  <select disabled={!canEdit} value={f.data_type} onChange={(e) => patch(f, { data_type: e.target.value as DataType })} className={selectCls}>
                    {DATA_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {t(d)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2">
                  <TextCell
                    value={f.description ?? ""}
                    disabled={!canEdit}
                    onCommit={(v) => patch(f, { description: v.trim() || null })}
                    className={`${inputCls} w-52`}
                  />
                </td>
                <td className="pr-2 pt-3 text-center">
                  <input type="checkbox" disabled={!canEdit} checked={f.allow_import} onChange={(e) => patch(f, { allow_import: e.target.checked })} />
                </td>
                <td className="pr-2 pt-3 text-center">
                  <input type="checkbox" disabled={!canEdit} checked={f.allow_extract} onChange={(e) => patch(f, { allow_extract: e.target.checked })} />
                </td>
                <td className="pr-2">
                  <select disabled={!canEdit} value={f.auto_select} onChange={(e) => patch(f, { auto_select: e.target.value as AutoSelect })} className={selectCls}>
                    <option value="system_first">{t("System first")}</option>
                    <option value="latest">{t("Latest")}</option>
                  </select>
                </td>
                <td className="sticky right-0 whitespace-nowrap bg-white pl-2 pt-2 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.15)]">
                  {canEdit && (
                    <>
                      <button disabled={i === 0} onClick={() => moveField(si, i, -1)} title={t("Move up")} className="px-1.5 text-gray-600 disabled:opacity-30">
                        ↑
                      </button>
                      <button disabled={i === sec.items.length - 1} onClick={() => moveField(si, i, 1)} title={t("Move down")} className="px-1.5 text-gray-600 disabled:opacity-30">
                        ↓
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(f)}
                      title={t("Delete")}
                      aria-label={t("Delete")}
                      className="ml-2 inline-flex h-[17px] w-[17px] items-center justify-center rounded bg-red-600 text-white hover:bg-red-500 align-middle"
                    >
                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 2l10 10M12 2L2 12" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-400">
                  {t("No result fields yet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Text input that only commits (PATCH) on blur/Enter when the value actually changed. */
function TextCell({
  value,
  disabled,
  onCommit,
  className,
}: {
  value: string;
  disabled: boolean;
  onCommit: (v: string) => unknown;
  className: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function commit() {
    if (draft !== value) onCommit(draft);
  }
  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
