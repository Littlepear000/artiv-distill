import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

/** 首页：左边讲清楚产品在做什么，右边是登录卡和访客预览入口。登录后直接进项目列表。 */
export default function HomePage() {
  const { t } = useI18n();
  const { currentUser, loading, login, enterGuest } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && currentUser) return <Navigate to="/projects" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/projects");
    } catch {
      setError(t("Incorrect email or password"));
    } finally {
      setBusy(false);
    }
  }

  function previewAsGuest() {
    enterGuest();
    navigate("/projects");
  }

  const btn = "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-5 text-sm font-medium";

  return (
    <div className="bg-white">
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-14 pt-12 md:grid-cols-[1fr_360px] md:pt-20">
        <div className="flex flex-col justify-center">
          <span className="w-fit whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {t("PDF → structured data")}
          </span>
          <h1 className="page-title mt-5 text-4xl leading-tight text-slate-900 md:text-5xl">
            {t("Distill stacks of PDF reports into one table you can trust")}
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">
            {t("Build a workflow once, run it on every report, and review each extracted value before it lands.")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={previewAsGuest} className={`${btn} bg-slate-800 text-white hover:bg-slate-700`}>
              {t("Preview as guest")}
            </button>
            <Link to="/signup-tenant" className={`${btn} border border-slate-300 text-slate-800 hover:border-slate-500`}>
              {t("Create a tenant")}
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-6 shadow-sm md:self-center">
          <h2 className="page-title text-lg text-slate-900">{t("Log in")}</h2>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <input
              type="email"
              placeholder={t("Email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder={t("Password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
              autoComplete="current-password"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className={`${btn} mt-1 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-60`}>
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
      </section>

      <section className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <ol className="grid gap-4 md:grid-cols-3">
            <Stage n={1} title={t("Collect reports")} blurb={t("Upload PDFs or point at an OSS folder; each report keeps its source.")}>
              <div className="flex flex-col gap-1.5">
                {["huaxin_2025_esg.pdf", "longi_2025_sustainability.pdf", "cmb_2025_csr.pdf"].map((f) => (
                  <div key={f} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5">
                    <span className="shrink-0 rounded bg-red-50 px-1.5 text-[10px] font-semibold leading-4 text-red-600">PDF</span>
                    <span className="truncate font-mono text-xs leading-4 text-slate-600">{f}</span>
                  </div>
                ))}
              </div>
            </Stage>
            <Stage n={2} title={t("Run a workflow")} blurb={t("Chain Code and Prompt nodes; each node runs in an isolated sandbox.")}>
              <div className="flex items-center gap-1.5">
                {[t("Extract text"), t("LLM"), t("Build table")].map((s, i) => (
                  <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded border border-gray-200 bg-white px-2 text-xs text-slate-700">
                      <span className="mr-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      {s}
                    </span>
                    {i < 2 && <span className="shrink-0 text-slate-400">→</span>}
                  </div>
                ))}
              </div>
            </Stage>
            <Stage n={3} title={t("Review results")} blurb={t("Every value keeps its history; snapshot, merge and export versions.")}>
              <table className="w-full table-fixed overflow-hidden rounded border border-gray-200 bg-white text-xs">
                <thead className="bg-gray-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">{t("Report")}</th>
                    <th className="px-2 py-1 text-right font-medium">tCO2e</th>
                    <th className="px-2 py-1 text-right font-medium">{t("Staff")}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[["Huaxin", "21.84M", "16,502"], ["Longi", "1.36M", "51,235"], ["CMB", "0.41M", "117,201"]].map(([a, b, c]) => (
                    <tr key={a} className="border-t border-gray-100">
                      <td className="truncate px-2 py-1">{a}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{b}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Stage>
          </ol>
        </div>
      </section>
    </div>
  );
}

function Stage({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold leading-6 text-white">{n}</span>
        <h3 className="page-title whitespace-nowrap text-base leading-6 text-slate-900">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-500">{blurb}</p>
      <div className="mt-4 hidden md:block">{children}</div>
    </li>
  );
}
