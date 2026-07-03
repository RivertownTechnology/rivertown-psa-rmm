import { useState, useCallback, useEffect } from 'react';
import { login as apiLogin, setTokens, clearTokens, getAccessToken, api } from '@/lib/api';
import { LoginPage } from '@/components/LoginPage';
import { ChangePassword } from '@/components/ChangePassword';
import { Dashboard } from '@/components/Dashboard';
import { MfaChallenge } from '@/components/MfaChallenge';
import { MfaSetupRequired } from '@/components/MfaSetupRequired';

interface PortalMe {
  firstName: string; lastName: string; email: string;
  portalRole: string; portalPermissions: string[];
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userName, setUserName] = useState<string>('');
  const [portalRole, setPortalRole] = useState<string>('user');
  const [portalPermissions, setPortalPermissions] = useState<string[]>(['tickets']);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loadingUser, setLoadingUser] = useState(() => !!getAccessToken());

  // MFA challenge state (credentials retained to allow re-sending the SMS code)
  const [mfaChallenge, setMfaChallenge] = useState<{ mfaToken: string; phoneHint: string; email: string; password: string } | null>(null);

  // Forced MFA setup
  const [mustSetupMfa, setMustSetupMfa] = useState(false);

  // Restore user state on mount/refresh if we have a valid token
  useEffect(() => {
    if (!isAuthenticated) { setLoadingUser(false); return; }
    api<PortalMe>('/portal/me')
      .then(me => {
        setUserName(`${me.firstName} ${me.lastName}`.trim() || me.email);
        setPortalRole(me.portalRole || 'user');
        setPortalPermissions(Array.isArray(me.portalPermissions) ? me.portalPermissions : ['tickets']);
      })
      .catch(() => {
        // Token invalid/expired — clear and force login
        clearTokens();
        setIsAuthenticated(false);
      })
      .finally(() => setLoadingUser(false));
  }, [isAuthenticated]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);

    // MFA required — show challenge
    if (data.mfaRequired) {
      setMfaChallenge({ mfaToken: data.mfaToken, phoneHint: data.phoneHint, email, password });
      return;
    }

    setTokens(data.accessToken, data.refreshToken);
    setUserName(data.user?.name ?? data.user?.email ?? email);
    setPortalRole(data.portalRole ?? 'user');
    setPortalPermissions(data.portalPermissions ?? ['tickets']);

    if (data.mustChangePassword) {
      setMustChangePassword(true);
      setCurrentPassword(password);
    }

    if (data.mustSetupMfa) {
      setMustSetupMfa(true);
    }

    setIsAuthenticated(true);
  }, []);

  const handleMfaVerified = useCallback(async (code: string) => {
    if (!mfaChallenge) return;
    const res = await fetch('/api/v1/portal/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: mfaChallenge.mfaToken, code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Verification failed' }));
      throw new Error(err.message || 'Invalid code');
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    setUserName(data.user?.name ?? data.user?.email ?? '');
    setPortalRole(data.portalRole ?? 'user');
    setPortalPermissions(data.portalPermissions ?? ['tickets']);
    setMfaChallenge(null);
    setIsAuthenticated(true);
  }, [mfaChallenge]);

  const handleMfaResend = useCallback(async () => {
    if (!mfaChallenge) return;
    // Re-authenticating issues a fresh challenge token and sends a new SMS code.
    const data = await apiLogin(mfaChallenge.email, mfaChallenge.password);
    if (data.mfaRequired) {
      setMfaChallenge(prev => prev && { ...prev, mfaToken: data.mfaToken, phoneHint: data.phoneHint });
    }
  }, [mfaChallenge]);

  const handlePasswordChanged = useCallback(() => {
    setMustChangePassword(false);
    setCurrentPassword('');
  }, []);

  const handleMfaSetupDone = useCallback(() => {
    setMustSetupMfa(false);
  }, []);

  const handleLogout = useCallback(() => {
    clearTokens();
    setIsAuthenticated(false);
    setUserName('');
    setPortalRole('user');
    setPortalPermissions(['tickets']);
    setMustChangePassword(false);
    setCurrentPassword('');
    setMfaChallenge(null);
    setMustSetupMfa(false);
  }, []);

  if (!isAuthenticated) {
    if (mfaChallenge) {
      return <MfaChallenge phoneHint={mfaChallenge.phoneHint} onVerify={handleMfaVerified} onCancel={() => setMfaChallenge(null)} onResend={handleMfaResend} />;
    }
    return <LoginPage onLogin={handleLogin} />;
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (mustChangePassword) {
    return <ChangePassword currentPassword={currentPassword} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  if (mustSetupMfa) {
    return <MfaSetupRequired onDone={handleMfaSetupDone} onLogout={handleLogout} />;
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
