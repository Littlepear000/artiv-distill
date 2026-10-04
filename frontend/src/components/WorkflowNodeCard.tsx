import { Handle, Position } from "reactflow";
import { useI18n } from "../i18n";

export interface WorkflowNodeCardData {
  label: string;
  order: number;
  code: string;
  prompt: string;
  selected: boolean;
  runStatus?: "pending" | "running" | "success" | "failed";
  outputFileNames?: string[];
  codeAssetLabel?: string;
  promptAssetLabel?: string;
}

const RUN_STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500 animate-pulse",
  success: "bg-green-500",
  failed: "bg-red-500",
};

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || "untitled";
  return trimmed.replace(/\s+/g, "_").replace(/[\\/:*?"<>|]/g, "");
}

export function deriveFileBadge(name: string, code: string, prompt: string, t: (s: string) => string = (s) => s): { icon: string; label: string } {
  if (code.trim()) {
    return { icon: "📄", label: `${sanitizeFilename(name)}.py` };
  }
  if (prompt.trim()) {
    return { icon: "✨", label: t("AI summary (default behavior)") };
  }
  return { icon: "↷", label: t("Pass-through node") };
}

export default function WorkflowNodeCard({ data }: { data: WorkflowNodeCardData }) {
  const { t } = useI18n();
  const fileBadge = deriveFileBadge(data.label, data.code, data.prompt, t);

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        data.selected ? "border-slate-800" : "border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{t("Node {n}", { n: data.order + 1 })}</span>
        {data.runStatus && (
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${RUN_STATUS_DOT[data.runStatus]}`} />
        )}
      </div>
      <div className="truncate font-medium">{data.label}</div>
      <div className="mt-1.5 flex items-center gap-1 truncate rounded bg-gray-50 px-1.5 py-1 font-mono text-[11px] text-gray-500">
        <span className="shrink-0">{fileBadge.icon}</span>
        <span className="truncate">{fileBadge.label}</span>
      </div>

      {(data.codeAssetLabel || data.promptAssetLabel) && (
        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-blue-700">
          {data.codeAssetLabel && <div className="truncate">📎 Code: {data.codeAssetLabel}</div>}
          {data.promptAssetLabel && <div className="truncate">📎 Prompt: {data.promptAssetLabel}</div>}
        </div>
      )}

      {data.runStatus === "success" && data.outputFileNames && (
        <div className="mt-1.5 border-t border-gray-100 pt-1">
          <div className="text-[10px] text-green-600">✓ {t("Produced {count} files", { count: data.outputFileNames.length })}</div>
          {data.outputFileNames.slice(0, 3).map((name) => (
            <div key={name} className="truncate font-mono text-[10px] text-gray-500">
              · {name}
            </div>
          ))}
          {data.outputFileNames.length > 3 && (
            <div className="text-[10px] text-gray-400">…{t("{count} more", { count: data.outputFileNames.length - 3 })}</div>
          )}
        </div>
      )}
      {data.runStatus === "failed" && <div className="mt-1 whitespace-nowrap text-[11px] text-red-600">✗ {t("Execution failed")}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
