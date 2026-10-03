import Editor from "@monaco-editor/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReactFlow, { Background, Controls, Edge, Node, NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import PdfInputNodeCard, { PdfInputNodeCardData } from "./PdfInputNodeCard";
import WorkflowNodeCard, { WorkflowNodeCardData } from "./WorkflowNodeCard";

const INPUT_NODE_ID = "__input__";
const nodeTypes = { workflowNode: WorkflowNodeCard, pdfInputNode: PdfInputNodeCard };

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
}

interface FileInfo {
  id: string;
  original_filename: string;
  size_bytes: number;
}

interface RunNodeStatus {
  node_id: string;
  status: "pending" | "running" | "success" | "failed";
  output_files: FileInfo[];
}

interface RunDetail {
  id: string;
  status: "pending" | "running" | "success" | "failed";
  input_files: FileInfo[];
  node_runs: RunNodeStatus[];
}

interface Props {
  basePath: string;
  nodes: WorkflowNodeData[];
  latestRun: RunDetail | null;
  onDownload: (fileId: string, filename: string) => void;
}

/**
 * 纯展示的流程图：只能看、不能改。
 * 编辑节点 Code/Prompt、增删节点、上传新 PDF 运行，都在「编辑」tab 里做；
 * 这里只负责"把工作流的样子和最近一次跑的结果，一眼看明白"。
 */
export default function WorkflowDiagramView({ basePath, nodes, latestRun, onDownload }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.order_index - b.order_index), [nodes]);

  function runStatusFor(nodeId: string): RunNodeStatus | undefined {
    return latestRun?.node_runs.find((nr) => nr.node_id === nodeId);
  }

  const flowNodes: Node<WorkflowNodeCardData | PdfInputNodeCardData>[] = useMemo(() => {
    const inputNode: Node<PdfInputNodeCardData> = {
      id: INPUT_NODE_ID,
      type: "pdfInputNode",
      position: { x: 0, y: 120 },
      draggable: false,
      data: {
        fileCount: latestRun?.input_files.length ?? 0,
        latestRunStatus: latestRun?.status ?? null,
        selected: selectedId === INPUT_NODE_ID,
      },
    };
    const processingNodes: Node<WorkflowNodeCardData>[] = sortedNodes.map((n, index) => {
      const runStatus = runStatusFor(n.id);
      return {
        id: n.id,
        type: "workflowNode",
        position: { x: (index + 1) * 240, y: 120 },
        draggable: false,
        data: {
          label: n.name,
          order: n.order_index,
          code: n.code,
          prompt: n.prompt,
          selected: n.id === selectedId,
          runStatus: runStatus?.status,
          outputCount: runStatus?.output_files.length,
        },
      };
    });
    return [inputNode, ...processingNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedNodes, selectedId, latestRun]);

  const flowEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    if (sortedNodes.length > 0) {
      edges.push({ id: `${INPUT_NODE_ID}-${sortedNodes[0].id}`, source: INPUT_NODE_ID, target: sortedNodes[0].id });
    }
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      edges.push({ id: `${sortedNodes[i].id}-${sortedNodes[i + 1].id}`, source: sortedNodes[i].id, target: sortedNodes[i + 1].id });
    }
    return edges;
  }, [sortedNodes]);

  const handleNodeClick: NodeMouseHandler = (_, node) => setSelectedId(node.id);

  const selectedNode = sortedNodes.find((n) => n.id === selectedId) ?? null;
  const isInputSelected = selectedId === INPUT_NODE_ID;
  const selectedRunStatus = selectedNode ? runStatusFor(selectedNode.id) : undefined;

  return (
    <div className="flex h-full">
      <div className="flex-1">
        <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodeClick={handleNodeClick} fitView>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {isInputSelected && (
        <div className="flex w-[360px] flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-4">
          <h2 className="font-medium">📥 PDF 输入</h2>
          <p className="text-sm text-gray-500">所有工作流统一从这里开始。想上传新一批 PDF 触发运行，请切到「编辑」tab。</p>
          {latestRun ? (
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">最近一次运行的输入文件</div>
              <ul className="flex flex-col gap-1">
                {latestRun.input_files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {f.original_filename}（{(f.size_bytes / 1024).toFixed(1)} KB）
                    </span>
                    <button onClick={() => onDownload(f.id, f.original_filename)} className="whitespace-nowrap text-slate-800 underline">
                      下载
                    </button>
                  </li>
                ))}
              </ul>
              <Link to={`${basePath}/runs/${latestRun.id}`} className="mt-3 inline-block whitespace-nowrap text-sm text-slate-800 underline">
                查看完整运行详情 →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">还没有运行过</p>
          )}
        </div>
      )}

      {!isInputSelected && selectedNode && (
        <div className="flex w-[420px] flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-4">
          <h2 className="font-medium">
            {selectedNode.order_index + 1}. {selectedNode.name}
          </h2>
          <p className="text-sm text-gray-500">这里只看结果，不能编辑。想改 Code/Prompt 请切到「编辑」tab。</p>

          {selectedNode.code.trim() && (
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">Code 预览（只读）</div>
              <Editor
                height="200px"
                language="python"
                value={selectedNode.code}
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, domReadOnly: true }}
              />
            </div>
          )}

          {selectedRunStatus ? (
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">最近一次运行产出</div>
              <p className="mb-2 text-sm text-gray-500">状态：{selectedRunStatus.status}</p>
              {selectedRunStatus.output_files.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {selectedRunStatus.output_files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {f.original_filename}（{(f.size_bytes / 1024).toFixed(1)} KB）
                      </span>
                      <button onClick={() => onDownload(f.id, f.original_filename)} className="whitespace-nowrap text-slate-800 underline">
                        下载
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">这次运行没有产出文件</p>
              )}
              {latestRun && (
                <Link to={`${basePath}/runs/${latestRun.id}`} className="mt-3 inline-block whitespace-nowrap text-sm text-slate-800 underline">
                  查看完整运行详情 →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">还没有运行过，看不到产出</p>
          )}
        </div>
      )}
    </div>
  );
}
