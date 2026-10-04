import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import apiClient from "../api/client";
import Avatar from "../components/Avatar";
import { ProjectOutletContext } from "../components/ProjectLayout";
import { useI18n } from "../i18n";
import { errorMessage } from "../utils/errors";

export default function ProjectSettingsPage() {
  const { project, reloadProject } = useOutletContext<ProjectOutletContext>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
    }
  }, [project]);

  if (!project) return <div className="p-8 text-center text-gray-500">{t("Loading…")}</div>;
  const isOwner = project.my_role === "owner";

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await apiClient.patch(`/projects/${project!.id}`, { name, description: description || null });
      await reloadProject();
      setMessage({ ok: true, text: t("Saved") });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, t("Could not save")) });
    }
  }

  async function handleDelete() {
    try {
      await apiClient.delete(`/projects/${project!.id}`);
      navigate("/projects");
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, t("Could not delete the project")) });
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4 pb-12">
      <h1 className="page-title mb-6 text-xl">{t("Project settings")}</h1>

      <form onSubmit={handleSave} className="mb-8 flex flex-col gap-4 rounded border border-gray-200 bg-white p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">{t("Project name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} required className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">{t("Description")}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isOwner} rows={3} className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
        </label>
        {isOwner ? (
          <div className="flex items-center gap-3">
            <button type="submit" className="whitespace-nowrap rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700">
              {t("Save changes")}
            </button>
            {message && <span className={`text-sm ${message.ok ? "text-green-600" : "text-red-600"}`}>{message.text}</span>}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t("Only project owners can change these settings.")}</p>
        )}
      </form>

      <section className="mb-8 rounded border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("Project owners")}</h2>
          <Link to={`/projects/${project.id}/members`} className="text-sm text-slate-600 underline">
            {t("Manage members")} ({project.member_count})
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {project.owners.map((o) => (
            <li key={o.id} className="flex items-center gap-3 text-sm">
              <Avatar name={o.name} size={28} />
              <span className="font-medium">{o.name}</span>
              <span className="text-gray-500">{o.email}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">{t("To make someone an admin of this project, set their role to Owner on the Members page.")}</p>
      </section>

      {isOwner && (
        <section className="rounded border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-700">{t("Danger zone")}</h2>
          <p className="mt-1 text-sm text-red-700">
            {t("Deleting a project removes its workflows, reports and runs. Type the project name to confirm.")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={project.name} className="rounded border border-red-300 px-3 py-2 text-sm" />
            <button
              disabled={confirmName !== project.name}
              onClick={handleDelete}
              className="whitespace-nowrap rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Delete project")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
