import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, setTokens, clearTokens, getAccessToken } from './api';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  mfaEnabled: boolean;
  mfaProvider: string | null;
  isSuperAdmin?: boolean;
  tenantName?: string;
  trialEndsAt?: string | null;
  pastDueAt?: string | null;
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'cancelled';
  planTier?: 'starter' | 'pro' | 'enterprise';
  trialDaysRemaining?: number | null;
  pastDueDaysRemaining?: number | null;
  trialExpired?: boolean;
  lockedOut?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<User>('/auth/me');
      setUser(data);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const loginFn = async (accessToken: string, refreshToken: string) => {
    setTokens(accessToken, refreshToken);
    await fetchUser();
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login: loginFn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
