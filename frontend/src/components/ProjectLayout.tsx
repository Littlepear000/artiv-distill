import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { ProjectInfo } from "../utils/project";
import Avatar from "./Avatar";

export interface ProjectOutletContext {
  project: ProjectInfo | null;
  reloadProject: () => Promise<void>;
}

export default function ProjectLayout() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId?: string }>();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();
  const [project, setProject] = useState<ProjectInfo | null>(null);

  const reloadProject = useCallback(async () => {
    const response = await apiClient.get<ProjectInfo>(`/projects/${projectId}`);
    setProject(response.data);
  }, [projectId]);

  useEffect(() => {
    reloadProject();
  }, [reloadProject]);

  const base = `/projects/${projectId}`;
  const path = location.pathname;
  const isReports = path === base || path === `${base}/` || path.startsWith(`${base}/reports/`);
  const items: { to: string; label: string; active: boolean }[] = [
    { to: base, label: t("Reports"), active: isReports },
    { to: `${base}/results`, label: t("Results"), active: path.startsWith(`${base}/results`) },
    { to: `${base}/report-fields`, label: t("Result fields"), active: path.startsWith(`${base}/report-fields`) },
    {
      to: workflowId ? `${base}/workflows/${workflowId}` : `${base}/workflows`,
      label: t("Workflows"),
      active: path.startsWith(`${base}/workflows`),
    },
    { to: `${base}/assets`, label: t("Code / Prompt library"), active: path.startsWith(`${base}/assets`) },
    { to: `${base}/members`, label: t("Members"), active: path.startsWith(`${base}/members`) },
    { to: `${base}/settings`, label: t("Settings"), active: path.startsWith(`${base}/settings`) },
  ];

  const roleLabel = project
    ? { owner: t("Owner"), editor: t("Editor"), viewer: t("Viewer") }[project.my_role]
    : "";

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white p-4">
        <Link to="/projects" className="whitespace-nowrap text-sm text-slate-600 underline">
          ← {t("All projects")}
        </Link>
        <h2 className="page-title mt-2 truncate text-base" title={project?.name}>
          {project?.name ?? t("Loading…")}
        </h2>

        <nav className="mt-6 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`whitespace-nowrap rounded px-3 py-2 text-sm ${
                item.active ? "bg-slate-800 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {currentUser && (
          <div className="mt-auto flex items-center gap-3 border-t border-gray-200 pt-3">
            <Avatar name={currentUser.name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={currentUser.name}>
                {currentUser.name}
              </div>
              <div className="truncate text-xs text-gray-500" title={currentUser.email}>
                {roleLabel || currentUser.email}
              </div>
            </div>
            <button onClick={logout} title={t("Log out")} className="text-xs text-gray-400 hover:text-gray-700">
              {t("Log out")}
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet context={{ project, reloadProject } satisfies ProjectOutletContext} />
      </main>
    </div>
  );
}
