import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ticket, FileText, CreditCard, Shield, Phone, Mail } from 'lucide-react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Welcome panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-12 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 right-20 w-96 h-96 rounded-full bg-blue-500 blur-3xl"></div>
          <div className="absolute bottom-20 left-20 w-80 h-80 rounded-full bg-cyan-500 blur-3xl"></div>
        </div>

        <div className="relative z-10">
          <div className="inline-block bg-white rounded-lg px-8 py-5 mb-12 shadow-lg">
            <img src="/logo.png" alt="Rivertown Technology" className="h-20 w-auto" />
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">Welcome to the<br />Customer Portal</h1>
          <p className="text-slate-300 text-lg max-w-md">
            Your direct line to IT support. Submit tickets, track progress, and manage your account — all in one place.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FeatureCard icon={<Ticket className="h-5 w-5" />} title="Submit Tickets" desc="Report issues and get help fast" />
            <FeatureCard icon={<FileText className="h-5 w-5" />} title="View Quotes" desc="Review and approve quotes online" />
            <FeatureCard icon={<CreditCard className="h-5 w-5" />} title="Pay Invoices" desc="Secure online payment options" />
            <FeatureCard icon={<Shield className="h-5 w-5" />} title="Track Assets" desc="See your managed devices" />
          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-300 space-y-1">
          <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> Need help? Call us at (843) 410-3982</div>
          <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> support@rivertowntechnology.com</div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img src="/logo.png" alt="Rivertown Technology" className="h-16 w-auto mx-auto mb-3" />
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

          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground space-y-2">
            <p>Don't have an account? Contact your account manager at Rivertown Technology to get portal access.</p>
            <p className="lg:hidden">
              <span className="flex items-center justify-center gap-2 mt-3"><Phone className="h-4 w-4" /> (843) 410-3982</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-cyan-400">{icon}</div>
        <div className="font-semibold text-sm">{title}</div>
      </div>
      <div className="text-xs text-slate-300">{desc}</div>
    </div>
  );
}
