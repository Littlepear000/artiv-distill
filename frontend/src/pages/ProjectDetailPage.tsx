import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import apiClient from "../api/client";

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
        const created = await apiClient.post<WorkflowRow>(`/projects/${projectId}/workflows`, { name: "主工作流" });
        if (!cancelled) setTargetWorkflowId(created.data.id);
      } catch {
        if (!cancelled) setError("这个项目还没有工作流，且你没有创建权限——请联系项目 Owner 或 Editor 创建一个");
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

  return <div className="p-8 text-center text-gray-500">加载中…</div>;
}
