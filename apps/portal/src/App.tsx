import { useState, useCallback, useEffect } from 'react';
import { login as apiLogin, setTokens, clearTokens, getAccessToken, api, fetchBranding, getSlugFromPath } from '@/lib/api';
import type { PortalBranding } from '@/lib/api';
import { LoginPage } from '@/components/LoginPage';
import { ChangePassword } from '@/components/ChangePassword';
import { Dashboard } from '@/components/Dashboard';
import { MfaChallenge } from '@/components/MfaChallenge';
import { MfaSetupRequired } from '@/components/MfaSetupRequired';

interface PortalMe {
  firstName: string; lastName: string; email: string;
  portalRole: string; portalPermissions: string[];
}

// Apply the tenant's primary color + tab title so the rest of the portal just
// inherits from CSS variables. Also updates the favicon if a logo is set.
function applyBranding(b: PortalBranding | null) {
  const root = document.documentElement;
  if (b?.primaryColor) {
    root.style.setProperty('--brand-primary', b.primaryColor);
  } else {
    root.style.removeProperty('--brand-primary');
  }
  if (b?.businessName) {
    document.title = `${b.businessName} — Customer Portal`;
  } else {
    document.title = 'Customer Portal';
  }
}

export function App() {
  const slug = getSlugFromPath();

  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [brandingState, setBrandingState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userName, setUserName] = useState<string>('');
  const [portalRole, setPortalRole] = useState<string>('user');
  const [portalPermissions, setPortalPermissions] = useState<string[]>(['tickets']);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loadingUser, setLoadingUser] = useState(() => !!getAccessToken());

  // MFA challenge state
  const [mfaChallenge, setMfaChallenge] = useState<{ mfaToken: string; phoneHint: string } | null>(null);

  // Forced MFA setup
  const [mustSetupMfa, setMustSetupMfa] = useState(false);

  // Load branding on mount. Missing slug or unknown slug → dedicated error view
  // (not the login form) so users understand they need a branded URL.
  useEffect(() => {
    if (!slug) {
      setBrandingState('missing');
      return;
    }
    fetchBranding(slug)
      .then((b) => {
        setBranding(b);
        applyBranding(b);
        setBrandingState('ready');
      })
      .catch(() => {
        setBrandingState('missing');
      });
  }, [slug]);

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
      setMfaChallenge({ mfaToken: data.mfaToken, phoneHint: data.phoneHint });
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

  // Bad / missing slug — show a neutral "this portal doesn't exist" rather than
  // a generic login form branded with nothing.
  if (brandingState === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Portal URL not found</h1>
          <p className="text-muted-foreground text-sm">
            This portal link isn't valid. Please use the URL your service provider sent you — it should look like <code className="px-1 py-0.5 bg-muted rounded">portal.forgepsa.com/your-company</code>.
          </p>
        </div>
      </div>
    );
  }

  if (brandingState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (mfaChallenge) {
      return <MfaChallenge phoneHint={mfaChallenge.phoneHint} onVerify={handleMfaVerified} onCancel={() => setMfaChallenge(null)} />;
    }
    return <LoginPage branding={branding} onLogin={handleLogin} />;
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
      branding={branding}
      onLogout={handleLogout}
    />
  );
}
