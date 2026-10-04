import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import Avatar from "./Avatar";
import LangSwitch from "./LangSwitch";

export default function NavBar() {
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();

  // 登录页也要能切语言，所以未登录时只渲染一个精简的顶栏
  if (!currentUser) {
    return (
      <nav className="flex h-14 items-center justify-between bg-slate-800 px-6 text-white">
        <span className="font-semibold">ArtivDistill</span>
        <LangSwitch />
      </nav>
    );
  }

  const isAdmin = currentUser.tenant_role === "admin";
  return (
    <nav className="flex h-14 items-center justify-between gap-3 bg-slate-800 px-6 text-white">
      <div className="flex items-center gap-6">
        <Link to="/projects" className="whitespace-nowrap font-semibold">
          ArtivDistill
        </Link>
        <Link to="/projects" className="whitespace-nowrap text-sm hover:underline">
          {t("Projects")}
        </Link>
        {isAdmin && (
          <Link to="/users" className="whitespace-nowrap text-sm hover:underline">
            {t("Tenant users")}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <LangSwitch />
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Avatar name={currentUser.name} size={26} />
          {currentUser.name}
          <span className="text-slate-300">({isAdmin ? t("Tenant admin") : t("Member")})</span>
        </span>
        <button onClick={logout} className="whitespace-nowrap rounded bg-slate-600 px-3 py-1 hover:bg-slate-500">
          {t("Log out")}
        </button>
      </div>
    </nav>
  );
}
