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
  companyType?: 'msp' | 'internal_it';
  trialEndsAt?: string | null;
  pastDueAt?: string | null;
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'cancelled';
  planTier?: 'starter' | 'pro' | 'enterprise';
  trialDaysRemaining?: number | null;
  pastDueDaysRemaining?: number | null;
  trialExpired?: boolean;
  lockedOut?: boolean;
  entitlements?: {
    plan: 'starter' | 'pro' | 'enterprise';
    maxBillableUsers: number;
    features: Record<string, boolean>;
  };
  onboarding?: {
    currentPsa: string | null;
    companySize: string | null;
    industry: string | null;
    supportedUsersRange: string | null;
    needs: string[];
    progress: Record<string, boolean>;
    dismissedAt: string | null;
  };
}

/**
 * Hook: check whether the current tenant has access to a gated feature.
 *   const canUseAi = useFeature('ai_assistant');
 */
export function useFeature(key: string): boolean {
  const { user } = useAuth();
  return user?.entitlements?.features?.[key] === true;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
    <AuthContext.Provider value={{ user, loading, login: loginFn, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
