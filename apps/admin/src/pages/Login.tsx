import { useState } from 'react';
import { Hammer, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { login as apiLogin } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      if (data.mfaRequired) {
        setError('MFA is not yet supported in the admin app. Sign in with a super-admin account without MFA, or disable MFA temporarily.');
        setLoading(false);
        return;
      }
      await login(data.accessToken, data.refreshToken);
      // AuthProvider will redirect non-super-admins back to login automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-white mb-4 shadow-2xl shadow-brand-600/40">
            <Hammer className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">ForgePSA Admin</h1>
          <p className="text-sm text-slate-400 flex items-center justify-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Platform operators only
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-900/30 border border-red-900/50 text-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-white placeholder:text-slate-600"
                placeholder="you@forgepsa.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-md transition-colors inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Unauthorized access is logged. All actions taken here are audited.
        </p>
      </div>
    </div>
  );
}
