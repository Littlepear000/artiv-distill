import { Handle, Position } from "reactflow";

export interface WorkflowNodeCardData {
  label: string;
  order: number;
  code: string;
  prompt: string;
  selected: boolean;
  runStatus?: "pending" | "running" | "success" | "failed";
  outputCount?: number;
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

export function deriveFileBadge(name: string, code: string, prompt: string): { icon: string; label: string } {
  if (code.trim()) {
    return { icon: "📄", label: `${sanitizeFilename(name)}.py` };
  }
  if (prompt.trim()) {
    return { icon: "✨", label: "AI 摘要（默认行为）" };
  }
  return { icon: "↷", label: "透传节点" };
}

export default function WorkflowNodeCard({ data }: { data: WorkflowNodeCardData }) {
  const fileBadge = deriveFileBadge(data.label, data.code, data.prompt);

  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        data.selected ? "border-slate-800" : "border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">节点 {data.order + 1}</span>
        {data.runStatus && (
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${RUN_STATUS_DOT[data.runStatus]}`} />
        )}
      </div>
      <div className="truncate font-medium">{data.label}</div>
      <div className="mt-1.5 flex items-center gap-1 truncate rounded bg-gray-50 px-1.5 py-1 font-mono text-[11px] text-gray-500">
        <span className="shrink-0">{fileBadge.icon}</span>
        <span className="truncate">{fileBadge.label}</span>
      </div>
      {data.runStatus === "success" && typeof data.outputCount === "number" && (
        <div className="mt-1 whitespace-nowrap text-[11px] text-green-600">✓ {data.outputCount} 个产出文件</div>
      )}
      {data.runStatus === "failed" && <div className="mt-1 whitespace-nowrap text-[11px] text-red-600">✗ 执行失败</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
