import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import apiClient from "../api/client";

interface ProjectInfo {
  id: string;
  name: string;
}

export default function ProjectLayout() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId?: string }>();
  const location = useLocation();
  const [project, setProject] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    apiClient.get<ProjectInfo>(`/projects/${projectId}`).then((response) => setProject(response.data));
  }, [projectId]);

  const workflowHref = workflowId ? `/projects/${projectId}/workflows/${workflowId}` : `/projects/${projectId}`;
  const isWorkflowSection = location.pathname.includes("/workflows");
  const isMembersSection = location.pathname.endsWith("/members");

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white p-4">
        <Link to="/projects" className="whitespace-nowrap text-sm text-slate-600 underline">
          ← 所有项目
        </Link>
        <h2 className="page-title mt-2 truncate text-base" title={project?.name}>
          {project?.name ?? "加载中…"}
        </h2>

        <nav className="mt-6 flex flex-col gap-1">
          <Link
            to={workflowHref}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm ${
              isWorkflowSection ? "bg-slate-800 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            工作流
          </Link>
          <Link
            to={`/projects/${projectId}/members`}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm ${
              isMembersSection ? "bg-slate-800 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            项目成员
          </Link>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
