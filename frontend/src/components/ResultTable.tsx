import { useMemo } from "react";
import { useI18n } from "../i18n";

export interface ResultColumn {
  key: string;
  label: string;
  group_name: string | null;
}

export interface ResultRow {
  id: string;
  name: string;
  values: Record<string, string | undefined>;
}

/** 按分组聚拢列：组顺序 = 组内最靠前字段的顺序，未分组放最后。 */
export function orderColumns<T extends ResultColumn>(cols: T[]): T[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const c of cols) {
    const g = c.group_name ?? "";
    if (!map.has(g)) {
      map.set(g, []);
      if (g) order.push(g);
    }
    map.get(g)!.push(c);
  }
  if (map.has("")) order.push("");
  return order.flatMap((g) => map.get(g)!);
}

interface Props {
  columns: ResultColumn[];
  rows: ResultRow[];
  activeId?: string | null;
  onRowClick?: (row: ResultRow, index: number) => void;
  emptyText?: string;
}

const NAME_W = "w-56 min-w-[14rem] max-w-[14rem]";

/** 宽表：首列(报告名)吸附左侧，表头吸顶，字段组表头行，横向滚动。 */
export default function ResultTable({ columns, rows, activeId, onRowClick, emptyText }: Props) {
  const { t } = useI18n();
  const cols = useMemo(() => orderColumns(columns), [columns]);
  const groups = useMemo(() => {
    const out: { name: string; span: number }[] = [];
    for (const c of cols) {
      const g = c.group_name ?? "";
      const last = out[out.length - 1];
      if (last && last.name === g) last.span += 1;
      else out.push({ name: g, span: 1 });
    }
    return out;
  }, [cols]);
  const hasGroups = groups.some((g) => g.name !== "");

  const headBase = "bg-slate-50 text-left text-xs font-medium text-gray-500 whitespace-nowrap";

  return (
    <div className="max-h-[calc(100vh-15rem)] min-h-[8rem] overflow-auto border-y border-gray-200">
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          {hasGroups && (
            <tr>
              <th className={`sticky left-0 top-0 z-30 h-8 ${NAME_W} ${headBase}`} />
              {groups.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.span}
                  className={`sticky top-0 z-20 h-8 border-l border-gray-200 px-3 ${headBase} ${g.name ? "border-b border-b-slate-300 font-semibold text-slate-700" : ""}`}
                >
                  {g.name}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th
              className={`sticky left-0 z-30 border-b border-gray-200 px-3 py-2 ${NAME_W} ${headBase}`}
              style={{ top: hasGroups ? 32 : 0 }}
            >
              {t("Report")}
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`sticky z-20 min-w-[8rem] max-w-[16rem] border-b border-gray-200 px-3 py-2 ${headBase}`}
                style={{ top: hasGroups ? 32 : 0 }}
                title={c.label}
              >
                <span className="block truncate">{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-gray-400">
                {emptyText ?? "—"}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const active = r.id === activeId;
            const bg = active ? "bg-sky-50" : "bg-white group-hover:bg-slate-50";
            return (
              <tr key={r.id} onClick={() => onRowClick?.(r, i)} className={`group ${onRowClick ? "cursor-pointer" : ""}`}>
                <td
                  className={`sticky left-0 z-10 border-b border-gray-100 px-3 py-2 font-medium text-slate-800 ${NAME_W} ${bg}`}
                  title={r.name}
                >
                  <span className="block truncate">{r.name}</span>
                </td>
                {cols.map((c) => {
                  const v = r.values[c.key];
                  return (
                    <td key={c.key} className={`min-w-[8rem] max-w-[16rem] border-b border-gray-100 px-3 py-2 ${bg}`} title={v || undefined}>
                      <span className={`block truncate ${v ? "text-slate-800" : "text-gray-300"}`}>{v || "—"}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
