import { ReactNode, useEffect, useState } from "react";
import { useI18n } from "../i18n";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** 标题右侧的操作区（打开链接、上一条/下一条等） */
  actions?: ReactNode;
  children: ReactNode;
}

/** 右侧滑入抽屉（纯展示，点遮罩 / Esc / × 关闭）。 */
export default function Drawer({ open, onClose, title, actions, children }: DrawerProps) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-[480px] max-w-full flex-col bg-white shadow-xl transition-transform duration-200 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium text-slate-800" title={typeof title === "string" ? title : undefined}>
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm">{actions}</div>
          <button onClick={onClose} aria-label={t("Close")} className="shrink-0 px-1 text-xl leading-none text-gray-500 hover:text-gray-800">
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-3">{children}</div>
      </aside>
    </div>
  );
}

export interface FieldListItem {
  key: string;
  label: string;
  group_name: string | null;
  value: string;
  /** 可选的附加信息（来源、是否固定、历史次数）；版本视图不传 */
  source?: string | null;
  pinned?: boolean;
  historyCount?: number;
}

/** 抽屉里的纵向字段列表：按分组出标题，扁平无框。 */
export function FieldList({ items }: { items: FieldListItem[] }) {
  const { t } = useI18n();
  const sections: { name: string; items: FieldListItem[] }[] = [];
  const idx = new Map<string, number>();
  for (const it of items) {
    const g = it.group_name ?? "";
    if (!idx.has(g)) {
      idx.set(g, sections.length);
      sections.push({ name: g, items: [] });
    }
    sections[idx.get(g)!].items.push(it);
  }
  // 未分组放最后
  sections.sort((a, b) => (a.name === "" ? 1 : 0) - (b.name === "" ? 1 : 0));
  const showHeadings = sections.some((s) => s.name !== "");

  const sourceLabel = (s: string) => (s === "system_parse" ? t("System") : s === "excel_import" ? t("Excel") : s === "manual" ? t("Manual") : s);

  return (
    <div>
      {sections.map((sec) => (
        <section key={sec.name || "__none__"} className="mb-5">
          {showHeadings && (
            <h3 className="mb-1 border-l-2 border-slate-400 pl-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {sec.name || t("Ungrouped")}
            </h3>
          )}
          <dl>
            {sec.items.map((it) => (
              <div key={it.key} className="border-b border-gray-100 py-2">
                <dt className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="min-w-0 truncate">{it.label}</span>
                  {it.source && <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{sourceLabel(it.source)}</span>}
                  {it.pinned && (
                    <span className="shrink-0" title={t("Pinned")}>
                      📌
                    </span>
                  )}
                  {!!it.historyCount && it.historyCount > 1 && (
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">{t("{n} values", { n: it.historyCount })}</span>
                  )}
                </dt>
                <dd className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${it.value ? "text-slate-900" : "text-gray-300"}`}>{it.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
