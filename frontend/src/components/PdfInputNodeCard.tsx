import { Handle, Position } from "reactflow";

export interface PdfInputNodeCardData {
  fileCount: number;
  latestRunStatus: "pending" | "running" | "success" | "failed" | null;
  selected: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  running: "执行中",
  success: "上次运行成功",
  failed: "上次运行失败",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500",
  success: "bg-green-500",
  failed: "bg-red-500",
};

export default function PdfInputNodeCard({ data }: { data: PdfInputNodeCardData }) {
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 border-dashed bg-slate-50 px-4 py-3 shadow-sm ${
        data.selected ? "border-slate-800" : "border-slate-400"
      }`}
    >
      <div className="text-xs text-gray-400">起始点</div>
      <div className="font-medium">📥 PDF 输入</div>
      <div className="mt-1.5 truncate text-xs text-gray-500">
        {data.fileCount > 0 ? `最近一次上传 ${data.fileCount} 个文件` : "点击上传 PDF 并运行"}
      </div>
      {data.latestRunStatus && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[data.latestRunStatus]}`} />
          {STATUS_LABEL[data.latestRunStatus]}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
