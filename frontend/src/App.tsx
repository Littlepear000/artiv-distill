import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ProjectMembersPage from "./pages/ProjectMembersPage";
import ProjectsPage from "./pages/ProjectsPage";
import SignupTenantPage from "./pages/SignupTenantPage";
import UsersPage from "./pages/UsersPage";
import WorkflowEditorPage from "./pages/WorkflowEditorPage";
import WorkflowsPage from "./pages/WorkflowsPage";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup-tenant" element={<SignupTenantPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId/members" element={<ProjectMembersPage />} />
          <Route path="/projects/:projectId/workflows" element={<WorkflowsPage />} />
          <Route path="/projects/:projectId/workflows/:workflowId" element={<WorkflowEditorPage />} />
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="/users" element={<UsersPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </div>
  );
}
