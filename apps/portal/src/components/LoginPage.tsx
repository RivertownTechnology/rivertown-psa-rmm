import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ticket, FileText, CreditCard, Shield, Phone, Mail, Fingerprint } from 'lucide-react';
import { setTokens, getSlugFromPath } from '@/lib/api';
import type { PortalBranding } from '@/lib/api';

interface LoginPageProps {
  branding: PortalBranding | null;
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginPage({ branding, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fallbacks keep the UI coherent if a field isn't set yet — no platform brand ever leaks.
  const businessName = branding?.businessName || 'Customer Portal';
  const logo = branding?.businessLogo || '';
  const phone = branding?.businessPhone || '';
  const supportEmail = branding?.businessEmail || '';
  const welcomeText =
    branding?.portalWelcomeText ||
    'Your direct line to IT support. Submit tickets, track progress, and manage your account — all in one place.';
  const primaryColor = branding?.primaryColor || '';

  // Accent background uses the tenant's primary color at low opacity when set,
  // falling back to the default slate gradient.
  const leftPanelStyle = primaryColor
    ? { backgroundColor: primaryColor, backgroundImage: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }
    : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeySignIn() {
    setError(''); setLoading(true);
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const slug = getSlugFromPath();

      // Request discoverable-credential options — server optionally scopes by slug
      const optsRes = await fetch('/api/v1/portal/auth/passkey/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!optsRes.ok) throw new Error('Failed to get passkey options');
      const options = await optsRes.json();

      const authResp = await startAuthentication({ optionsJSON: options });

      // Forward the slug so server can verify the passkey belongs to this tenant
      const loginRes = await fetch('/api/v1/portal/auth/passkey/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...authResp, slug }),
      });
      if (!loginRes.ok) {
        const e = await loginRes.json().catch(() => ({ message: 'Passkey sign-in failed' }));
        throw new Error(e.message || 'Passkey sign-in failed');
      }
      const data = await loginRes.json();
      setTokens(data.accessToken, data.refreshToken);
      window.location.reload(); // simplest way to reinitialize app state
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was cancelled');
      } else {
        setError(err.message || 'Passkey sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Welcome panel — tinted by the tenant's primary color if set */}
      <div
        className="hidden lg:flex flex-col justify-between text-white p-12 relative overflow-hidden"
        style={leftPanelStyle ?? { background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
      >
        {/* Decorative background */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 right-20 w-96 h-96 rounded-full bg-white blur-3xl"></div>
          <div className="absolute bottom-20 left-20 w-80 h-80 rounded-full bg-white blur-3xl"></div>
        </div>

        <div className="relative z-10">
          {logo ? (
            <div className="inline-block bg-white rounded-lg px-8 py-5 mb-12 shadow-lg">
              <img src={logo} alt={businessName} className="h-20 w-auto" />
            </div>
          ) : (
            <div className="inline-block bg-white/10 backdrop-blur-sm rounded-lg px-6 py-4 mb-12">
              <div className="text-xl font-semibold">{businessName}</div>
            </div>
          )}
          <h1 className="text-4xl font-bold mb-4 leading-tight">Welcome to the<br />Customer Portal</h1>
          <p className="text-white/80 text-lg max-w-md">{welcomeText}</p>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FeatureCard icon={<Ticket className="h-5 w-5" />} title="Submit Tickets" desc="Report issues and get help fast" />
            <FeatureCard icon={<FileText className="h-5 w-5" />} title="View Quotes" desc="Review and approve quotes online" />
            <FeatureCard icon={<CreditCard className="h-5 w-5" />} title="Pay Invoices" desc="Secure online payment options" />
            <FeatureCard icon={<Shield className="h-5 w-5" />} title="Track Assets" desc="See your managed devices" />
          </div>
        </div>

        {(phone || supportEmail) && (
          <div className="relative z-10 text-sm text-white/80 space-y-1">
            {phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> Need help? Call us at {phone}</div>}
            {supportEmail && <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {supportEmail}</div>}
          </div>
        )}
      </div>

      {/* Right: Login form */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            {logo ? (
              <img src={logo} alt={businessName} className="h-16 w-auto mx-auto mb-3" />
            ) : (
              <div className="text-xl font-semibold mb-2">{businessName}</div>
            )}
            <h1 className="text-2xl font-bold">Customer Portal</h1>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold mb-1">Sign in to your account</h2>
            <p className="text-muted-foreground text-sm">Enter your email and password to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
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
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 text-base gap-2"
            onClick={handlePasskeySignIn}
            disabled={loading}
          >
            <Fingerprint className="h-5 w-5" />
            Sign in with Passkey
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">Your device will prompt you to use your fingerprint, face, or security key.</p>

          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground space-y-2">
            <p>
              Don't have an account? Contact your account manager
              {businessName ? ` at ${businessName}` : ''} to get portal access.
            </p>
            {phone && (
              <p className="lg:hidden">
                <span className="flex items-center justify-center gap-2 mt-3"><Phone className="h-4 w-4" /> {phone}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-white">{icon}</div>
        <div className="font-semibold text-sm">{title}</div>
      </div>
      <div className="text-xs text-white/80">{desc}</div>
    </div>
  );
}
