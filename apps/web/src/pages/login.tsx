import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { login as apiLogin, verifyMfa } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA challenge state
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiLogin(email, password);

      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setMfaStep(true);
        setLoading(false);
        return;
      }

      if (data.mfaSetupRequired) {
        setMfaSetupRequired(true);
      }

      await login(data.accessToken, data.refreshToken);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  if (mfaStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMfaVerify} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="mfaCode">Verification Code</Label>
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
                  You can also use a backup code
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading || mfaCode.length < 6}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setMfaStep(false);
                  setMfaCode('');
                  setMfaToken('');
                  setError('');
                }}
              >
                Back to login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="Rivertown Technology" className="mx-auto mb-4 h-16 w-auto object-contain" />
          <CardTitle className="text-2xl">Rivertown PSA</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            {mfaSetupRequired && (
              <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded-md border border-yellow-200">
                Your organization requires MFA. Please set it up in Settings.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <a
              href={`${(import.meta as any).env?.VITE_API_URL || ''}/api/v1/auth/google`}
              className="inline-flex items-center justify-center gap-2 w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
