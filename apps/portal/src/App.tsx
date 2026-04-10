import { useState, useCallback } from 'react';
import { login as apiLogin, setTokens, clearTokens, getAccessToken, api } from '@/lib/api';
import { LoginPage } from '@/components/LoginPage';
import { ChangePassword } from '@/components/ChangePassword';
import { Dashboard } from '@/components/Dashboard';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userName, setUserName] = useState<string>('');
  const [portalRole, setPortalRole] = useState<string>('user');
  const [portalPermissions, setPortalPermissions] = useState<string[]>(['tickets']);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');

  const handleLogin = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setTokens(data.accessToken, data.refreshToken);
    setUserName(data.user?.name ?? data.user?.email ?? email);
    setPortalRole(data.portalRole ?? 'user');
    setPortalPermissions(data.portalPermissions ?? ['tickets']);

    if (data.mustChangePassword) {
      setMustChangePassword(true);
      setCurrentPassword(password);
    }

    setIsAuthenticated(true);
  }, []);

  const handlePasswordChanged = useCallback(() => {
    setMustChangePassword(false);
    setCurrentPassword('');
  }, []);

  const handleLogout = useCallback(() => {
    clearTokens();
    setIsAuthenticated(false);
    setUserName('');
    setPortalRole('user');
    setPortalPermissions(['tickets']);
    setMustChangePassword(false);
    setCurrentPassword('');
  }, []);

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (mustChangePassword) {
    return <ChangePassword currentPassword={currentPassword} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
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
