import { FormEvent, useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import apiClient from "../api/client";
import Avatar from "../components/Avatar";
import { ProjectOutletContext } from "../components/ProjectLayout";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";
import { ProjectRole } from "../utils/project";

interface MemberRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  project_role: ProjectRole;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

export default function ProjectMembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentUser } = useAuth();
  const { project, reloadProject } = useOutletContext<ProjectOutletContext>();
  const { t } = useI18n();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [tenantUsers, setTenantUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [error, setError] = useState<string | null>(null);

  const isOwner = project?.my_role === "owner";
  const roleLabel: Record<ProjectRole, string> = { owner: t("Owner"), editor: t("Editor"), viewer: t("Viewer") };

  async function loadData() {
    const membersRes = await apiClient.get<MemberRow[]>(`/projects/${projectId}/members`);
    setMembers(membersRes.data);
    if (isOwner) {
      // 只有 Owner 需要「可添加的租户用户」列表；普通成员无权调用 /users
      try {
        const usersRes = await apiClient.get<UserRow[]>("/users");
        setTenantUsers(usersRes.data);
      } catch {
        setTenantUsers([]);
      }
    }
  }

  useEffect(() => {
    loadData();
  }, [projectId, isOwner]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await loadData();
      await reloadProject();
    } catch (err) {
      setError(errorMessage(err, t("Operation failed")));
    }
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    run(async () => {
      await apiClient.post(`/projects/${projectId}/members`, { user_id: selectedUserId, project_role: role });
      setSelectedUserId("");
      setRole("viewer");
    });
  }

  const availableUsers = tenantUsers.filter((u) => !members.some((m) => m.user_id === u.id));
  const ownerCount = members.filter((m) => m.project_role === "owner").length;

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4 pb-12">
      <h1 className="page-title mb-1 text-xl">{t("Project members")}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {t("Owners are project admins: they can rename the project, manage members and change roles. Editors can change content; Viewers are read-only.")}
      </p>

      {isOwner && (
        <form onSubmit={handleAdd} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="select-chevron rounded border border-gray-300 py-2 pl-3">
            <option value="">{t("Select a tenant user…")}</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="select-chevron rounded border border-gray-300 py-2 pl-3">
            <option value="viewer">{roleLabel.viewer}</option>
            <option value="editor">{roleLabel.editor}</option>
            <option value="owner">{roleLabel.owner}</option>
          </select>
          <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
            {t("Add member")}
          </button>
        </form>
      )}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2 pl-2">{t("Member")}</th>
            <th>{t("Role")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isSelf = m.user_id === currentUser?.id;
            const lastOwner = m.project_role === "owner" && ownerCount <= 1;
            return (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="py-2 pl-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user_name} size={30} />
                    <div>
                      <div className="font-medium">
                        {m.user_name}
                        {isSelf && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">{t("You")}</span>}
                      </div>
                      <div className="text-xs text-gray-500">{m.user_email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {isOwner ? (
                    <select
                      value={m.project_role}
                      disabled={lastOwner}
                      title={lastOwner ? t("A project must keep at least one owner") : undefined}
                      onChange={(e) => run(() => apiClient.patch(`/projects/${projectId}/members/${m.id}`, { project_role: e.target.value }))}
                      className="select-chevron rounded border border-gray-300 py-1 pl-2 disabled:bg-gray-100"
                    >
                      <option value="viewer">{roleLabel.viewer}</option>
                      <option value="editor">{roleLabel.editor}</option>
                      <option value="owner">{roleLabel.owner}</option>
                    </select>
                  ) : (
                    <span className="uppercase">{roleLabel[m.project_role]}</span>
                  )}
                </td>
                <td className="pr-2 text-right">
                  {isOwner && !lastOwner && (
                    <button
                      onClick={() => {
                        if (window.confirm(t("Remove {name} from this project?", { name: m.user_name }))) {
                          run(() => apiClient.delete(`/projects/${projectId}/members/${m.id}`));
                        }
                      }}
                      className="whitespace-nowrap text-red-600 hover:underline"
                    >
                      {t("Remove")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
