import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens, clearTokens, getAccessToken } from './api';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  tenantName?: string;
}

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchUser() {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<AdminUser>('/auth/me');
      if (!data.isSuperAdmin) {
        // Not a super-admin — clear tokens and force re-login with a clear message
        clearTokens();
        setUser(null);
      } else {
        setUser(data);
      }
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUser(); }, []);

  const loginFn = async (access: string, refresh: string) => {
    setTokens(access, refresh);
    await fetchUser();
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login: loginFn, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
