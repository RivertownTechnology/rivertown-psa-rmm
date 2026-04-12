import { useState } from 'react';
import { Hammer, Check, ArrowRight, Loader2 } from 'lucide-react';

type Step = 1 | 2 | 3;

export function Signup({ navigate }: { navigate: (p: string) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function stepOneValid() {
    return companyName.trim().length >= 2;
  }

  function stepTwoValid() {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    if (password.length < 10) return false;
    if (password !== confirmPassword) return false;
    return true;
  }

  async function submit() {
    if (!stepTwoValid()) return;
    setSubmitting(true);
    setError(null);
    try {
      // In prod, VITE_API_URL points at https://api.forgepsa.com.
      // In dev, Vite's proxy rewrites relative /api/v1 → localhost:3000.
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, firstName, lastName, email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.message || 'Signup failed. Please try again.');
      }
      const data = await res.json();
      // Hand tokens to the app via URL hash — app.forgepsa.com/login#token=...&refresh=... consumes them.
      if (data?.accessToken && data?.refreshToken) {
        const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';
        const target = `${appUrl}/login#token=${encodeURIComponent(data.accessToken)}&refresh=${encodeURIComponent(data.refreshToken)}`;
        window.location.href = target;
        return;
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-50 flex flex-col">
      {/* Lightweight header */}
      <header className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold text-lg text-slate-900">
          <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
            <Hammer className="h-5 w-5" />
          </div>
          ForgePSA
        </button>
        <div className="text-sm text-slate-600">
          Already have an account?{' '}
          <a href="https://app.forgepsa.com" className="text-brand-600 hover:text-brand-700 font-semibold">
            Sign in
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          {/* Progress */}
          {step !== 3 && (
            <div className="flex items-center justify-center gap-2 mb-8">
              <StepDot active={step >= 1} done={step > 1} label="Company" />
              <div className={`h-0.5 w-12 ${step > 1 ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <StepDot active={step >= 2} done={step > 2} label="Admin" />
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            {step === 1 && (
              <>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Start your free trial</h1>
                <p className="text-slate-600 mb-6">
                  45 days, full access, no credit card required. Tell us about your MSP.
                </p>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
                <input
                  autoFocus
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Managed Services"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900"
                />
                <p className="text-xs text-slate-500 mt-1">
                  This is the name your customers will see in the portal.
                </p>

                <button
                  disabled={!stepOneValid()}
                  onClick={() => setStep(2)}
                  className="mt-6 w-full bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your admin account</h1>
                <p className="text-slate-600 mb-6">
                  You'll be the first user at <span className="font-semibold text-slate-900">{companyName}</span>. You can invite your team later.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">First name</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Last name</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900"
                    />
                  </div>
                </div>

                <label className="block text-sm font-medium text-slate-700 mb-1">Work email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900 mb-3"
                />

                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900 mb-3"
                />

                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900"
                />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>
                )}

                {error && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep(1)}
                    disabled={submitting}
                    className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    disabled={!stepTwoValid() || submitting}
                    onClick={submit}
                    className="flex-[2] bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
                      </>
                    ) : (
                      <>
                        Start 45-day free trial <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-500 mt-4 text-center">
                  By creating an account you agree to our{' '}
                  <a href="/terms" className="underline hover:text-slate-700">Terms</a> and{' '}
                  <a href="/privacy" className="underline hover:text-slate-700">Privacy Policy</a>.
                </p>
              </>
            )}

            {step === 3 && (
              <div className="text-center py-8">
                <div className="h-16 w-16 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to ForgePSA</h1>
                <p className="text-slate-600 mb-6">
                  Your account is ready. We've sent a welcome email to <span className="font-semibold text-slate-900">{email}</span>.
                </p>
                <a
                  href="https://app.forgepsa.com"
                  className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  Go to your dashboard <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>

          {step !== 3 && (
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <TrialPerk label="45 days free" />
              <TrialPerk label="No credit card" />
              <TrialPerk label="Cancel anytime" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${
          done
            ? 'bg-brand-600 text-white'
            : active
              ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
              : 'bg-slate-100 text-slate-400'
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : label[0]}
      </div>
      <span className={`text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

function TrialPerk({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
      <Check className="h-3.5 w-3.5 text-brand-600" />
      {label}
    </div>
  );
}
