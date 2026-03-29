import { useState, useCallback } from 'react';
import { login as apiLogin, setTokens, clearTokens, getAccessToken } from '@/lib/api';
import { LoginPage } from '@/components/LoginPage';
import { Dashboard } from '@/components/Dashboard';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userName, setUserName] = useState<string>('');

  const handleLogin = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setTokens(data.accessToken, data.refreshToken);
    setUserName(data.user?.name ?? data.user?.email ?? email);
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearTokens();
    setIsAuthenticated(false);
    setUserName('');
  }, []);

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <Dashboard userName={userName} onLogout={handleLogout} />;
}
