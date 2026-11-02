import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import apiClient from "../api/client";
import { guestUser } from "../guest/fixtures";
import { isGuestMode, setGuestMode } from "../guest/mode";

interface CurrentUser {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  tenant_role: "admin" | "member";
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  loading: boolean;
  isGuest: boolean;
  enterGuest: () => void;
  login: (email: string, password: string) => Promise<void>;
  signupTenant: (tenantName: string, adminName: string, adminEmail: string, adminPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState<boolean>(isGuestMode);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(isGuest ? guestUser : null);
  const [loading, setLoading] = useState(!isGuest);

  async function fetchMe() {
    try {
      const response = await apiClient.get<CurrentUser>("/auth/me");
      setCurrentUser(response.data);
    } catch {
      localStorage.removeItem("access_token");
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isGuestMode()) return;
    if (localStorage.getItem("access_token")) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, []);

  // 访客预览：不发任何请求，直接以示例身份进入，数据由 guest/adapter 本地提供
  function enterGuest() {
    setGuestMode(true);
    setIsGuest(true);
    setCurrentUser(guestUser);
    setLoading(false);
  }

  function leaveGuest() {
    setGuestMode(false);
    setIsGuest(false);
  }

  async function login(email: string, password: string) {
    leaveGuest();
    const response = await apiClient.post<{ access_token: string }>("/auth/login", { email, password });
    localStorage.setItem("access_token", response.data.access_token);
    await fetchMe();
  }

  async function signupTenant(tenantName: string, adminName: string, adminEmail: string, adminPassword: string) {
    leaveGuest();
    const response = await apiClient.post<{ access_token: string }>("/auth/signup-tenant", {
      tenant_name: tenantName,
      admin_name: adminName,
      admin_email: adminEmail,
      admin_password: adminPassword,
    });
    localStorage.setItem("access_token", response.data.access_token);
    await fetchMe();
  }

  function logout() {
    leaveGuest();
    localStorage.removeItem("access_token");
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ currentUser, loading, isGuest, enterGuest, login, signupTenant, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
