import { useEffect, useState } from 'react';
import { Hammer, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { login as apiLogin, verifyMfa } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Step = 'email' | 'password' | 'sso' | 'mfa';
type SsoProvider = 'google' | 'microsoft' | 'saml';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

export function LoginPage() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ssoProvider, setSsoProvider] = useState<SsoProvider | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Consume hash tokens from marketing signup redirect
  useEffect(() => {
    if (!window.location.hash) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get('token');
    const refresh = params.get('refresh');
    if (access && refresh) {
      window.history.replaceState(null, '', window.location.pathname);
      login(access, refresh).catch(() => setError('Could not complete signup. Please sign in.'));
    }
  }, [login]);

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sso-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data?.method === 'sso' && data.provider) {
        setSsoProvider(data.provider as SsoProvider);
        setStep('sso');
      } else {
        setStep('password');
      }
    } catch {
      // Lookup is best-effort — if it fails, fall through to password
      setStep('password');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setStep('mfa');
        setLoading(false);
        return;
      }
      await login(data.accessToken, data.refreshToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await verifyMfa(mfaToken, mfaCode);
      await login(data.accessToken, data.refreshToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setStep('email');
    setPassword('');
    setSsoProvider(null);
    setError('');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mx-auto mb-3 shadow-md">
            <Hammer className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">ForgePSA</CardTitle>
          <CardDescription>
            {step === 'email' && 'Sign in to your account'}
            {step === 'password' && <EmailDisplay email={email} onChange={startOver} />}
            {step === 'sso' && <EmailDisplay email={email} onChange={startOver} />}
            {step === 'mfa' && 'Enter your verification code'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={handleEmailContinue} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email.includes('@')}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Continue
              </Button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !password}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sign in
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <a
                href={`${API_BASE}/api/v1/auth/google`}
                className="inline-flex items-center justify-center gap-3 w-full rounded-md bg-white border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <GoogleG />
                Continue with Google
              </a>
            </form>
          )}

          {step === 'sso' && ssoProvider && (
            <SsoStep provider={ssoProvider} email={email} onFallback={() => setStep('password')} />
          )}

          {step === 'mfa' && (
            <form onSubmit={handleMfaVerify} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="mfaCode">Verification code</Label>
                <Input
                  id="mfaCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9A-Za-z\-]*"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="text-center text-2xl tracking-widest"
                  autoFocus
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator, or a backup code.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading || mfaCode.length < 6}>
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={startOver}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Back
              </Button>
            </form>
          )}

          {step === 'email' && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Don't have an account?{' '}
              <a href="https://forgepsa.com/signup" className="text-primary hover:underline font-medium">
                Start a 45-day free trial
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmailDisplay({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      Signing in as <strong className="text-foreground">{email}</strong>
      <button onClick={onChange} className="text-primary hover:underline text-xs font-medium">
        (change)
      </button>
    </span>
  );
}

function SsoStep({
  provider, email, onFallback,
}: {
  provider: SsoProvider;
  email: string;
  onFallback: () => void;
}) {
  const providerInfo: Record<SsoProvider, { label: string; icon: React.ReactNode; implemented: boolean; href?: string }> = {
    google: {
      label: 'Continue with Google',
      icon: <GoogleG />,
      implemented: true,
      href: `${API_BASE}/api/v1/auth/google?login_hint=${encodeURIComponent(email)}`,
    },
    microsoft: {
      label: 'Continue with Microsoft',
      icon: <MicrosoftIcon />,
      implemented: false,
    },
    saml: {
      label: 'Continue with SSO',
      icon: <SamlIcon />,
      implemented: false,
    },
  };

  const info = providerInfo[provider];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Your organization uses {providerLabel(provider)} single sign-on.
      </p>

      {info.implemented ? (
        <a
          href={info.href}
          className="inline-flex items-center justify-center gap-3 w-full rounded-md bg-white border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          {info.icon}
          {info.label}
        </a>
      ) : (
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center gap-3 w-full rounded-md bg-slate-100 border border-slate-200 px-4 py-3 text-sm font-medium text-slate-500">
            {info.icon}
            {info.label} (coming soon)
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {providerLabel(provider)} SSO isn't fully wired up yet. Use password sign-in below for now.
          </p>
        </div>
      )}

      <Button variant="ghost" className="w-full" onClick={onFallback}>
        Use password instead
      </Button>
    </div>
  );
}

function providerLabel(p: SsoProvider): string {
  return p === 'microsoft' ? 'Microsoft' : p === 'google' ? 'Google' : 'SAML';
}

/* ---- Icons ---- */

function GoogleG() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

function SamlIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 3 7v5c0 5 3.5 9.5 9 10 5.5-.5 9-5 9-10V7l-9-5z" />
    </svg>
  );
}
