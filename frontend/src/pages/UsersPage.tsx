import { FormEvent, useEffect, useState } from "react";
import apiClient from "../api/client";
import { useI18n } from "../i18n";

interface UserRow {
  id: string;
  email: string;
  name: string;
  tenant_role: "admin" | "member";
  is_active: boolean;
}

export default function UsersPage() {
  const { t } = useI18n();
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
      setError(t("Creation failed. Check whether the email is already in use"));
    }
  }

  async function handleDeactivate(userId: string) {
    await apiClient.delete(`/users/${userId}`);
    await loadUsers();
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <h1 className="page-title mb-6 text-xl">{t("Tenant user management")}</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <input placeholder={t("Name")} value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <input type="email" placeholder={t("Email")} value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <input type="password" placeholder={t("Initial password")} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "member")}
          className="select-chevron rounded border border-gray-300 py-2 pl-3"
        >
          <option value="member">{t("Member")}</option>
          <option value="admin">{t("Tenant admin")}</option>
        </select>
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          {t("Add user")}
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("Name")}</th>
            <th>{t("Email")}</th>
            <th>{t("Role")}</th>
            <th>{t("Status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-100">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>{u.tenant_role === "admin" ? t("Tenant admin") : t("Member")}</td>
              <td>{u.is_active ? t("Active") : t("Disabled")}</td>
              <td>
                {u.is_active && (
                  <button onClick={() => handleDeactivate(u.id)} className="whitespace-nowrap text-red-600 hover:underline">
                    {t("Disable")}
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
