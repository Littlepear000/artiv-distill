import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function NavBar() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-6 py-3 text-white">
      <div className="flex flex-wrap items-center gap-6">
        <span className="whitespace-nowrap font-semibold">PDF Workflow Platform</span>
        <Link to="/projects" className="whitespace-nowrap text-sm hover:underline">
          项目
        </Link>
        {currentUser.tenant_role === "admin" && (
          <Link to="/users" className="whitespace-nowrap text-sm hover:underline">
            租户用户管理
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="whitespace-nowrap">
          {currentUser.name}（{currentUser.tenant_role === "admin" ? "租户管理员" : "成员"}）
        </span>
        <button onClick={logout} className="whitespace-nowrap rounded bg-slate-600 px-3 py-1 hover:bg-slate-500">
          退出登录
        </button>
      </div>
    </nav>
  );
}
