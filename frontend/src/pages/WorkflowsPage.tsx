import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";

interface WorkflowRow {
  id: string;
  name: string;
  updated_at: string;
}

export default function WorkflowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [name, setName] = useState("");

  async function loadWorkflows() {
    const response = await apiClient.get<WorkflowRow[]>(`/projects/${projectId}/workflows`);
    setWorkflows(response.data);
  }

  useEffect(() => {
    loadWorkflows();
  }, [projectId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(`/projects/${projectId}/workflows`, { name });
    setName("");
    await loadWorkflows();
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <Link to="/projects" className="text-sm text-slate-600 underline">
        ← 返回项目列表
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">工作流</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <input
          placeholder="工作流名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          新建工作流
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {workflows.map((w) => (
          <li key={w.id} className="flex items-center justify-between rounded border border-gray-200 p-4">
            <span className="font-medium">{w.name}</span>
            <Link to={`/projects/${projectId}/workflows/${w.id}`} className="text-sm text-slate-800 underline">
              打开编辑器
            </Link>
          </li>
        ))}
        {workflows.length === 0 && <p className="text-sm text-gray-500">该项目下还没有工作流</p>}
      </ul>
    </div>
  );
}
