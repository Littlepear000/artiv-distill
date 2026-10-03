import { Handle, Position } from "reactflow";

export interface WorkflowNodeCardData {
  label: string;
  order: number;
  selected: boolean;
}

export default function WorkflowNodeCard({ data }: { data: WorkflowNodeCardData }) {
  return (
    <div
      className={`min-w-[160px] rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        data.selected ? "border-slate-800" : "border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="text-xs text-gray-400">节点 {data.order + 1}</div>
      <div className="truncate font-medium">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
