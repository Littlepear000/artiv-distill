import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReactFlow, { Background, Controls, Edge, Node, NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import apiClient from "../api/client";
import PdfInputNodeCard, { PdfInputNodeCardData } from "./PdfInputNodeCard";
import WorkflowNodeCard, { WorkflowNodeCardData } from "./WorkflowNodeCard";
import { fileTypeLabel } from "../utils/fileType";
import { useI18n } from "../i18n";

const INPUT_NODE_ID = "__input__";
const nodeTypes = { workflowNode: WorkflowNodeCard, pdfInputNode: PdfInputNodeCard };

interface WorkflowNodeData {
  id: string;
  name: string;
  code: string;
  prompt: string;
  order_index: number;
  code_asset_id: string | null;
  code_asset_version: number | null;
  prompt_asset_id: string | null;
  prompt_asset_version: number | null;
}

interface AssetOption {
  id: string;
  name: string;
}

interface FileInfo {
  id: string;
  original_filename: string;
  content_type: string;
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
  projectId: string;
  nodes: WorkflowNodeData[];
  latestRun: RunDetail | null;
  onDownload: (fileId: string, filename: string) => void;
}

/**
 * 纯展示的流程图：只能看、不能改。
 * 编辑节点 Code/Prompt、增删节点、上传新 PDF 运行，都在「编辑」tab 里做；
 * 这里只负责"把工作流的样子和最近一次跑的结果，一眼看明白"。
 */
export default function WorkflowDiagramView({ basePath, projectId, nodes, latestRun, onDownload }: Props) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [codeAssets, setCodeAssets] = useState<AssetOption[]>([]);
  const [promptAssets, setPromptAssets] = useState<AssetOption[]>([]);

  useEffect(() => {
    apiClient.get<AssetOption[]>(`/projects/${projectId}/assets`, { params: { kind: "code" } }).then((r) => setCodeAssets(r.data));
    apiClient.get<AssetOption[]>(`/projects/${projectId}/assets`, { params: { kind: "prompt" } }).then((r) => setPromptAssets(r.data));
  }, [projectId]);

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.order_index - b.order_index), [nodes]);

  function assetLabel(assets: AssetOption[], assetId: string | null, version: number | null): string | undefined {
    if (!assetId) return undefined;
    const asset = assets.find((a) => a.id === assetId);
    const name = asset?.name ?? t("(deleted asset)");
    return version !== null ? `${name} v${version}` : name;
  }

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
          outputFileNames: runStatus?.output_files.map((f) => f.original_filename),
          codeAssetLabel: assetLabel(codeAssets, n.code_asset_id, n.code_asset_version),
          promptAssetLabel: assetLabel(promptAssets, n.prompt_asset_id, n.prompt_asset_version),
        },
      };
    });
    return [inputNode, ...processingNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedNodes, selectedId, latestRun, codeAssets, promptAssets, t]);

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
          <h2 className="font-medium">📥 {t("PDF input")}</h2>
          <p className="text-sm text-gray-500">{t("Every workflow starts here. To upload a new batch of PDFs and trigger a run, switch to the Edit tab.")}</p>
          {latestRun ? (
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">{t("Input files of the latest run")}</div>
              <ul className="flex flex-col gap-1">
                {latestRun.input_files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {f.original_filename}{" "}
                      <span className="whitespace-nowrap rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-600">
                        {fileTypeLabel(f.content_type, f.original_filename, t)}
                      </span>{" "}
                      {t("({size} KB)", { size: (f.size_bytes / 1024).toFixed(1) })}
                    </span>
                    <button onClick={() => onDownload(f.id, f.original_filename)} className="whitespace-nowrap text-slate-800 underline">
                      {t("Download")}
                    </button>
                  </li>
                ))}
              </ul>
              <Link to={`${basePath}/runs/${latestRun.id}`} className="mt-3 inline-block whitespace-nowrap text-sm text-slate-800 underline">
                {t("View full run details →")}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t("No runs yet")}</p>
          )}
        </div>
      )}

      {!isInputSelected && selectedNode && (
        <div className="flex w-[420px] flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-4">
          <h2 className="font-medium">
            {selectedNode.order_index + 1}. {selectedNode.name}
          </h2>
          <p className="text-sm text-gray-500">{t("This view is read-only. To change Code/Prompt, switch to the Edit tab.")}</p>

          {(assetLabel(codeAssets, selectedNode.code_asset_id, selectedNode.code_asset_version) ||
            assetLabel(promptAssets, selectedNode.prompt_asset_id, selectedNode.prompt_asset_version)) && (
            <div className="rounded bg-blue-50 p-2 text-xs text-blue-700">
              {assetLabel(codeAssets, selectedNode.code_asset_id, selectedNode.code_asset_version) && (
                <div>📎 {t("Code from asset library: {name}", { name: assetLabel(codeAssets, selectedNode.code_asset_id, selectedNode.code_asset_version) ?? "" })}</div>
              )}
              {assetLabel(promptAssets, selectedNode.prompt_asset_id, selectedNode.prompt_asset_version) && (
                <div>
                  📎 {t("Prompt from asset library: {name}", { name: assetLabel(promptAssets, selectedNode.prompt_asset_id, selectedNode.prompt_asset_version) ?? "" })}
                </div>
              )}
            </div>
          )}

          {selectedNode.code_asset_id && (
            <Link
              to={`/projects/${projectId}/assets/${selectedNode.code_asset_id}`}
              className="inline-block w-fit whitespace-nowrap text-sm text-slate-800 underline"
            >
              {t("View full code in the Code library →")}
            </Link>
          )}

          {selectedRunStatus ? (
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">{t("Latest run output")}</div>
              <p className="mb-2 text-sm text-gray-500">{t("Status: {status}", { status: selectedRunStatus.status })}</p>
              {selectedRunStatus.output_files.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {selectedRunStatus.output_files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {f.original_filename}{" "}
                        <span className="whitespace-nowrap rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] text-gray-600">
                          {fileTypeLabel(f.content_type, f.original_filename, t)}
                        </span>{" "}
                        {t("({size} KB)", { size: (f.size_bytes / 1024).toFixed(1) })}
                      </span>
                      <button onClick={() => onDownload(f.id, f.original_filename)} className="whitespace-nowrap text-slate-800 underline">
                        {t("Download")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">{t("This run produced no files")}</p>
              )}
              {latestRun && (
                <Link to={`${basePath}/runs/${latestRun.id}`} className="mt-3 inline-block whitespace-nowrap text-sm text-slate-800 underline">
                  {t("View full run details →")}
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t("No runs yet, so there is no output to show")}</p>
          )}
        </div>
      )}
    </div>
  );
}
