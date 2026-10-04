import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

export default function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { t } = useI18n();
  const { currentUser, loading } = useAuth();

  if (loading) return <div className="p-8 text-center text-gray-500">{t("Loading…")}</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (adminOnly && currentUser.tenant_role !== "admin") return <Navigate to="/projects" replace />;

  return <Outlet />;
}
