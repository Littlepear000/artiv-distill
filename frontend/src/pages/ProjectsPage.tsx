import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function loadProjects() {
    const response = await apiClient.get<ProjectRow[]>("/projects");
    setProjects(response.data);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await apiClient.post("/projects", { name, description: description || null });
    setName("");
    setDescription("");
    await loadProjects();
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <h1 className="page-title mb-6 text-xl">项目</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <input placeholder="项目名称" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <input placeholder="项目描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded border border-gray-300 px-3 py-2" />
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          新建项目
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 p-4 hover:border-slate-400 hover:bg-gray-50"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                {p.description && <div className="text-sm text-gray-500">{p.description}</div>}
              </div>
              <span className="whitespace-nowrap text-sm text-gray-400">查看 →</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-500">暂无可见项目</p>}
      </ul>
    </div>
  );
}
