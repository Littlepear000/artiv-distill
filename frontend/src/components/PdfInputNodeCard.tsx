import { Handle, Position } from "reactflow";
import { useI18n } from "../i18n";

export interface PdfInputNodeCardData {
  fileCount: number;
  latestRunStatus: "pending" | "running" | "success" | "failed" | null;
  selected: boolean;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  success: "Last run succeeded",
  failed: "Last run failed",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500",
  success: "bg-green-500",
  failed: "bg-red-500",
};

export default function PdfInputNodeCard({ data }: { data: PdfInputNodeCardData }) {
  const { t } = useI18n();
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 border-dashed bg-slate-50 px-4 py-3 shadow-sm ${
        data.selected ? "border-slate-800" : "border-slate-400"
      }`}
    >
      <div className="text-xs text-gray-400">{t("Start")}</div>
      <div className="font-medium">📥 {t("PDF input")}</div>
      <div className="mt-1.5 truncate text-xs text-gray-500">
        {data.fileCount > 0 ? t("Last upload: {count} files", { count: data.fileCount }) : t("Click to upload PDFs and run")}
      </div>
      {data.latestRunStatus && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[data.latestRunStatus]}`} />
          {t(STATUS_LABEL_KEYS[data.latestRunStatus])}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
