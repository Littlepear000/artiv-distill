import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "../api/client";

interface MemberRow {
  id: string;
  user_id: string;
  project_role: "owner" | "editor" | "viewer";
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

export default function ProjectMembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [tenantUsers, setTenantUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<"owner" | "editor" | "viewer">("viewer");

  async function loadData() {
    const [membersRes, usersRes] = await Promise.all([
      apiClient.get<MemberRow[]>(`/projects/${projectId}/members`),
      apiClient.get<UserRow[]>("/users"),
    ]);
    setMembers(membersRes.data);
    setTenantUsers(usersRes.data);
  }

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    await apiClient.post(`/projects/${projectId}/members`, { user_id: selectedUserId, project_role: role });
    setSelectedUserId("");
    setRole("viewer");
    await loadData();
  }

  async function handleRemove(memberId: string) {
    await apiClient.delete(`/projects/${projectId}/members/${memberId}`);
    await loadData();
  }

  function userLabel(userId: string) {
    const user = tenantUsers.find((u) => u.id === userId);
    return user ? `${user.name}（${user.email}）` : userId;
  }

  const availableUsers = tenantUsers.filter((u) => !members.some((m) => m.user_id === u.id));

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <h1 className="page-title mb-6 mt-2 text-xl">项目成员管理</h1>

      <form onSubmit={handleAdd} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="select-chevron rounded border border-gray-300 py-2 pl-3"
        >
          <option value="">选择租户用户…</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}（{u.email}）
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "owner" | "editor" | "viewer")}
          className="select-chevron rounded border border-gray-300 py-2 pl-3"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          添加成员
        </button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">成员</th>
            <th>角色</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-gray-100">
              <td className="py-2">{userLabel(m.user_id)}</td>
              <td className="uppercase">{m.project_role}</td>
              <td>
                <button onClick={() => handleRemove(m.id)} className="whitespace-nowrap text-red-600 hover:underline">
                  移除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
