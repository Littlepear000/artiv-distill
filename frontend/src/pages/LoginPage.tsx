import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/projects");
    } catch {
      setError(t("Incorrect email or password"));
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border border-gray-200 p-8 shadow-sm">
      <h1 className="page-title mb-6 text-xl">{t("Log in")}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder={t("Email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder={t("Password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
          {t("Log in")}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        {t("No tenant yet?")}{" "}
        <Link to="/signup-tenant" className="whitespace-nowrap text-slate-800 underline">
          {t("Create a new tenant")}
        </Link>
      </p>
    </div>
  );
}
