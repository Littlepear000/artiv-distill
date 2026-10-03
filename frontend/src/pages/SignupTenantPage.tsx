import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SignupTenantPage() {
  const { signupTenant } = useAuth();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signupTenant(tenantName, adminName, adminEmail, adminPassword);
      navigate("/projects");
    } catch {
      setError("创建失败，请检查邮箱是否已被使用");
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-gray-200 p-8 shadow-sm">
      <h1 className="page-title mb-6 text-xl">创建新租户</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          placeholder="租户/机构名称"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          placeholder="管理员姓名"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="email"
          placeholder="管理员邮箱"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="密码（至少8位）"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          创建租户并登录
        </button>
      </form>
    </div>
  );
}
