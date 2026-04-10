import { useState, useCallback } from 'react';
import { login as apiLogin, setTokens, clearTokens, getAccessToken } from '@/lib/api';
import { LoginPage } from '@/components/LoginPage';
import { Dashboard } from '@/components/Dashboard';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userName, setUserName] = useState<string>('');
  const [portalRole, setPortalRole] = useState<string>('user');
  const [portalPermissions, setPortalPermissions] = useState<string[]>(['tickets']);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setTokens(data.accessToken, data.refreshToken);
    setUserName(data.user?.name ?? data.user?.email ?? email);
    setPortalRole(data.portalRole ?? 'user');
    setPortalPermissions(data.portalPermissions ?? ['tickets']);
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearTokens();
    setIsAuthenticated(false);
    setUserName('');
    setPortalRole('user');
    setPortalPermissions(['tickets']);
  }, []);

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Dashboard
      userName={userName}
      portalRole={portalRole}
      portalPermissions={portalPermissions}
      onLogout={handleLogout}
    />
  );
}
