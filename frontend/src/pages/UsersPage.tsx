import { FormEvent, useEffect, useState } from "react";
import apiClient from "../api/client";

interface UserRow {
  id: string;
  email: string;
  name: string;
  tenant_role: "admin" | "member";
  is_active: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    const response = await apiClient.get<UserRow[]>("/users");
    setUsers(response.data);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post("/users", { name, email, password, tenant_role: role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      await loadUsers();
    } catch {
      setError("创建失败，请检查邮箱是否已被使用");
    }
  }

  async function handleDeactivate(userId: string) {
    await apiClient.delete(`/users/${userId}`);
    await loadUsers();
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <h1 className="mb-6 text-xl font-semibold">租户用户管理</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <input type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <input type="password" placeholder="初始密码" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} className="rounded border border-gray-300 px-3 py-2">
          <option value="member">普通成员</option>
          <option value="admin">租户管理员</option>
        </select>
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          新增用户
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">姓名</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-100">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>{u.tenant_role === "admin" ? "租户管理员" : "普通成员"}</td>
              <td>{u.is_active ? "启用" : "已禁用"}</td>
              <td>
                {u.is_active && (
                  <button onClick={() => handleDeactivate(u.id)} className="text-red-600 hover:underline">
                    禁用
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
