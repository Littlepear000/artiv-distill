import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

interface WorkflowRow {
  id: string;
  name: string;
  created_at: string;
}

/**
 * `/projects/:projectId` 本身没有内容——它只负责决定该带用户去看哪个工作流：
 * 有工作流就去最早创建的那个，一个都没有就自动建一个默认的，省得用户每次都要先建流程。
 */
export default function ProjectDetailPage() {
  const { t } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const [targetWorkflowId, setTargetWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const response = await apiClient.get<WorkflowRow[]>(`/projects/${projectId}/workflows`);
      if (cancelled) return;

      if (response.data.length > 0) {
        const sorted = [...response.data].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setTargetWorkflowId(sorted[0].id);
        return;
      }

      try {
        const created = await apiClient.post<WorkflowRow>(`/projects/${projectId}/workflows`, { name: t("Main workflow") });
        if (!cancelled) setTargetWorkflowId(created.data.id);
      } catch {
        if (!cancelled) setError(t("This project has no workflows and you do not have permission to create one. Ask a project Owner or Editor to create one"));
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return <div className="p-8 text-sm text-gray-500">{error}</div>;
  }

  if (targetWorkflowId) {
    return <Navigate to={`/projects/${projectId}/workflows/${targetWorkflowId}`} replace />;
  }

  return <div className="p-8 text-center text-gray-500">{t("Loading…")}</div>;
}
