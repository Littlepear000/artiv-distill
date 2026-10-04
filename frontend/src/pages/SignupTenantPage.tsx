import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

export default function SignupTenantPage() {
  const { t } = useI18n();
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
      setError(t("Creation failed. Check whether the email is already in use"));
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-gray-200 p-8 shadow-sm">
      <h1 className="page-title mb-6 text-xl">{t("Create a new tenant")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          placeholder={t("Tenant / organization name")}
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          placeholder={t("Admin name")}
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="email"
          placeholder={t("Admin email")}
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder={t("Password (at least 8 characters)")}
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          {t("Create tenant and log in")}
        </button>
      </form>
    </div>
  );
}
