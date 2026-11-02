import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GUEST_BLOCKED_EVENT } from "../guest/mode";
import { useI18n } from "../i18n";
import Avatar from "./Avatar";
import LangSwitch from "./LangSwitch";

export default function NavBar() {
  const { currentUser, isGuest, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [blockedAt, setBlockedAt] = useState(0);

  // 访客点了写操作：顶栏下方弹一条只读提示，几秒后自动消失
  useEffect(() => {
    const onBlocked = () => setBlockedAt(Date.now());
    window.addEventListener(GUEST_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(GUEST_BLOCKED_EVENT, onBlocked);
  }, []);
  useEffect(() => {
    if (!blockedAt) return;
    const timer = setTimeout(() => setBlockedAt(0), 3500);
    return () => clearTimeout(timer);
  }, [blockedAt]);

  // 首页也要能切语言，所以未登录时只渲染一个精简的顶栏
  if (!currentUser) {
    return (
      <nav className="flex h-14 items-center justify-between bg-slate-800 px-6 text-white">
        <Link to="/" className="whitespace-nowrap font-semibold">
          ArtivDistill
        </Link>
        <LangSwitch />
      </nav>
    );
  }

  function exit() {
    logout();
    navigate("/");
  }

  const isAdmin = currentUser.tenant_role === "admin";
  const navBtn = "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded px-3 text-sm";
  return (
    <>
      <nav className="flex h-14 items-center justify-between gap-3 bg-slate-800 px-4 text-white sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/projects" className="whitespace-nowrap font-semibold">
            ArtivDistill
          </Link>
          <Link to="/projects" className="hidden whitespace-nowrap text-sm hover:underline sm:inline">
            {t("Projects")}
          </Link>
          {isAdmin && (
            <Link to="/users" className="hidden whitespace-nowrap text-sm hover:underline sm:inline">
              {t("Tenant users")}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm sm:gap-4">
          <LangSwitch />
          {isGuest ? (
            <>
              <span className="hidden whitespace-nowrap rounded-full bg-amber-400/90 px-2.5 text-xs font-medium leading-6 text-slate-900 sm:inline-block">
                {t("Guest preview")}
              </span>
              <Link to="/signup-tenant" className={`${navBtn} hidden bg-white text-slate-800 hover:bg-slate-100 sm:inline-flex`}>
                {t("Create a tenant")}
              </Link>
              <button onClick={exit} className={`${navBtn} bg-slate-600 hover:bg-slate-500`}>
                {t("Exit preview")}
              </button>
            </>
          ) : (
            <>
              <span className="hidden items-center gap-2 whitespace-nowrap sm:flex">
                <Avatar name={currentUser.name} size={26} />
                {currentUser.name}
                <span className="text-slate-300">({isAdmin ? t("Tenant admin") : t("Member")})</span>
              </span>
              <button onClick={exit} className={`${navBtn} bg-slate-600 hover:bg-slate-500`}>
                {t("Log out")}
              </button>
            </>
          )}
        </div>
      </nav>
      {blockedAt > 0 && (
        <div role="status" className="fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {t("Guest preview is read-only. Create a tenant to make changes.")}
        </div>
      )}
    </>
  );
}
