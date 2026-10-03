import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import ProjectLayout from "./components/ProjectLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ProjectMembersPage from "./pages/ProjectMembersPage";
import ProjectsPage from "./pages/ProjectsPage";
import RunDetailPage from "./pages/RunDetailPage";
import RunHistoryPage from "./pages/RunHistoryPage";
import SignupTenantPage from "./pages/SignupTenantPage";
import UsersPage from "./pages/UsersPage";
import WorkflowEditorPage from "./pages/WorkflowEditorPage";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup-tenant" element={<SignupTenantPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="workflows/:workflowId" element={<WorkflowEditorPage />} />
            <Route path="workflows/:workflowId/runs" element={<RunHistoryPage />} />
            <Route path="workflows/:workflowId/runs/:runId" element={<RunDetailPage />} />
            <Route path="members" element={<ProjectMembersPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="/users" element={<UsersPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </div>
  );
}
