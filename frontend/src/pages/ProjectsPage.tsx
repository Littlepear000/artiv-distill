import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";
import { ProjectInfo, timeAgo } from "../utils/project";

/**
 * 首页 = 「搜索框 + 项目看板」混合形态：
 * 上面是居中的大搜索框（回车直接进入第一个匹配项目，按 / 聚焦），下面是按最近活动排序的项目卡片，
 * 每张卡片带角色、负责人、报告/成员/工作流数量，一眼能看到「我手头有什么」，一次点击进入项目。
 */
export default function ProjectsPage() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    const response = await apiClient.get<ProjectInfo[]>("/projects");
    setProjects(response.data);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(projects ?? [])].sort(
      (a, b) =>
        new Date(b.last_activity_at ?? b.created_at).getTime() - new Date(a.last_activity_at ?? a.created_at).getTime()
    );
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.owners.some((o) => o.name.toLowerCase().includes(q))
    );
  }, [projects, query]);

  const totals = useMemo(
    () => ({
      reports: (projects ?? []).reduce((s, p) => s + p.report_count, 0),
      owned: (projects ?? []).filter((p) => p.my_role === "owner").length,
    }),
    [projects]
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiClient.post<ProjectInfo>("/projects", { name, description: description || null });
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, t("Could not create the project")));
    }
  }

  const roleLabel = { owner: t("Owner"), editor: t("Editor"), viewer: t("Viewer") };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-12">
      <div className="text-center">
        <h1 className="page-title text-3xl">
          {t("Welcome back, {name}", { name: currentUser?.name ?? "" })}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {t("{projects} projects · {reports} reports · you own {owned}", {
            projects: projects?.length ?? 0,
            reports: totals.reports,
            owned: totals.owned,
          })}
        </p>
        <div className="mx-auto mt-6 max-w-2xl">
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) navigate(`/projects/${filtered[0].id}`);
            }}
            placeholder={t("Search projects, or press Enter to open the first match…")}
            className="w-full rounded-full border border-gray-300 bg-white px-6 py-4 text-base shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          <p className="mt-2 text-xs text-gray-400">{t("Tip: press / anywhere to focus search")}</p>
        </div>
      </div>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {query ? t("Search results") : t("Your projects, by recent activity")}
        </h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
            + {t("New project")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <input placeholder={t("Project name")} value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" required autoFocus />
          <input placeholder={t("Description (optional)")} value={description} onChange={(e) => setDescription(e.target.value)} className="min-w-[16rem] flex-1 rounded border border-gray-300 px-3 py-2" />
          <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
            {t("Create project")}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="whitespace-nowrap px-2 py-2 text-sm text-gray-500 hover:underline">
            {t("Cancel")}
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}

      {projects === null && <p className="text-sm text-gray-500">{t("Loading…")}</p>}
      {projects !== null && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {query ? t("No project matches your search") : t("No projects yet — create your first one")}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="page-title truncate text-base" title={p.name}>
                  {p.name}
                </div>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">{roleLabel[p.my_role]}</span>
              </div>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-gray-500">{p.description || " "}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat value={p.report_count} label={t("Reports")} />
                <Stat value={p.member_count} label={t("Members")} />
                <Stat value={p.workflow_count} label={t("Workflows")} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <span className="truncate" title={p.owners.map((o) => o.name).join(", ")}>
                  {t("Owner")}: {p.owners.map((o) => o.name).join(", ") || "—"}
                </span>
                <span className="shrink-0">{timeAgo(p.last_activity_at ?? p.created_at, lang)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded bg-gray-50 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
