import { useEffect, useState } from 'react';
import {
  Hammer, Check, ArrowRight, ArrowLeft, Loader2, Building2, User, Briefcase,
  Lock, Sparkles, Wrench, Server, Users2, Calculator, Globe,
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type CompanyType = 'msp' | 'internal_it';
type CompanySize = '1-5' | '6-20' | '21-50' | '50+';
type BillingModel = 'per_user' | 'per_device' | 'flat_rate' | 'hybrid' | 'none';
type SupportedUsersRange = '1-50' | '51-200' | '201-1000' | '1000+';
type ITNeed = 'ticketing' | 'asset_tracking' | 'change_management' | 'knowledge_base';

interface FormState {
  // Step 2
  companyName: string;
  companySize: CompanySize | '';
  companyType: CompanyType | '';
  industry: string;

  // Step 3
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  // Step 4 (MSP)
  billsClients: boolean;
  billingModel: BillingModel | '';
  defaultHourlyRate: string; // kept as string until submit
  currency: string;
  timezone: string;

  // Step 4 (Internal IT)
  supportedUsersRange: SupportedUsersRange | '';
  needs: ITNeed[];

  // Step 5
  password: string;
  confirmPassword: string;
}

const EMPTY: FormState = {
  companyName: '', companySize: '', companyType: '', industry: '',
  firstName: '', lastName: '', email: '', phone: '',
  billsClients: true, billingModel: '', defaultHourlyRate: '',
  currency: 'USD', timezone: 'America/New_York',
  supportedUsersRange: '', needs: [],
  password: '', confirmPassword: '',
};

const STORAGE_KEY = 'forgepsa.signup.state';

function detectBrowserDefaults() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const currency = locale?.includes('GB') ? 'GBP'
      : locale?.includes('CA') ? 'CAD'
      : locale?.includes('AU') ? 'AUD'
      : locale?.includes('EUR') || /de|fr|es|it|nl/i.test(locale) ? 'EUR'
      : 'USD';
    return { tz, currency };
  } catch {
    return { tz: 'America/New_York', currency: 'USD' };
  }
}

export function Signup({ navigate }: { navigate: (p: string) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<FormState>(() => {
    // Rehydrate from sessionStorage so a refresh doesn't blow away progress
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return { ...EMPTY, ...JSON.parse(saved) };
    } catch {}
    const { tz, currency } = detectBrowserDefaults();
    return { ...EMPTY, timezone: tz, currency };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist on every change so a refresh keeps you where you were
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((prev) => ({ ...prev, [k]: v }));
  }

  function next() { setStep((s) => (Math.min(6, s + 1) as Step)); }
  function back() { setStep((s) => (Math.max(1, s - 1) as Step)); }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const payload: Record<string, unknown> = {
        companyName: state.companyName,
        firstName: state.firstName,
        lastName: state.lastName,
        email: state.email,
        password: state.password,
        companyType: state.companyType || 'msp',
        companySize: state.companySize || undefined,
        industry: state.industry || undefined,
        phone: state.phone || undefined,
        currency: state.currency,
        timezone: state.timezone,
      };

      if (state.companyType === 'msp') {
        payload.billsClients = state.billsClients;
        if (state.billsClients && state.billingModel) payload.billingModel = state.billingModel;
        if (state.defaultHourlyRate) {
          const rate = parseInt(state.defaultHourlyRate, 10);
          if (!isNaN(rate)) payload.defaultHourlyRate = rate;
        }
      } else if (state.companyType === 'internal_it') {
        if (state.supportedUsersRange) payload.supportedUsersRange = state.supportedUsersRange;
        if (state.needs.length > 0) payload.needs = state.needs;
      }

      const res = await fetch(`${apiBase}/api/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message || b?.message || 'Signup failed. Please try again.');
      }
      const data = await res.json();

      // Clear wizard state on success — sensitive data shouldn't linger in sessionStorage
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}

      if (data?.accessToken && data?.refreshToken) {
        const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';
        window.location.href = `${appUrl}/login#token=${encodeURIComponent(data.accessToken)}&refresh=${encodeURIComponent(data.refreshToken)}`;
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-50 flex flex-col">
      {/* Lightweight header */}
      <header className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center" aria-label="ForgePSA home">
          <img src="/forgepsa-logo.png" alt="ForgePSA" className="h-12 w-auto" />
        </button>
        {step !== 1 && step !== 6 && (
          <div className="text-sm text-slate-600">
            Already have an account?{' '}
            <a href={(import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com'} className="text-brand-600 hover:text-brand-700 font-semibold">
              Sign in
            </a>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {step > 1 && step < 6 && <ProgressBar step={step} />}

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 md:p-10">
            {step === 1 && <StepWelcome onStart={next} />}
            {step === 2 && (
              <StepCompany
                state={state}
                setField={setField}
                onBack={back}
                onNext={next}
              />
            )}
            {step === 3 && (
              <StepContact
                state={state}
                setField={setField}
                onBack={back}
                onNext={next}
              />
            )}
            {step === 4 && (
              <StepConfig
                state={state}
                setField={setField}
                onBack={back}
                onNext={next}
              />
            )}
            {step === 5 && (
              <StepSecurity
                state={state}
                setField={setField}
                onBack={back}
                onNext={next}
              />
            )}
            {step === 6 && (
              <StepReview
                state={state}
                onBack={back}
                onSubmit={submit}
                submitting={submitting}
                error={error}
              />
            )}
          </div>

          {step === 2 && (
            <p className="text-xs text-center text-slate-500 mt-6">
              Takes ~2 minutes. Every field after company basics is optional — skip anything you're not sure about.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------------- Progress ---------------- */

function ProgressBar({ step }: { step: Step }) {
  const steps = [
    { n: 2, label: 'Company' },
    { n: 3, label: 'You' },
    { n: 4, label: 'Setup' },
    { n: 5, label: 'Security' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
              step > s.n
                ? 'bg-brand-600 text-white'
                : step === s.n
                  ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {step > s.n ? <Check className="h-4 w-4" /> : s.n - 1}
          </div>
          <span className={`text-xs font-medium hidden sm:inline ${step >= s.n ? 'text-slate-900' : 'text-slate-400'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-4 sm:w-8 ${step > s.n ? 'bg-brand-600' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Step 1: Welcome ---------------- */

function StepWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-6">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white mb-6 shadow-lg shadow-brand-600/30">
        <Hammer className="h-8 w-8" />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Let's forge your workspace</h1>
      <p className="text-lg text-slate-600 mb-2 max-w-lg mx-auto">
        In the next 2 minutes we'll tailor ForgePSA to how your business actually runs —
        billing model, team size, currency, time zone.
      </p>
      <p className="text-sm text-slate-500 mb-8">
        You'll land in a workspace that's already configured, not an empty template.
      </p>

      <button
        onClick={onStart}
        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors shadow-lg shadow-brand-600/20 inline-flex items-center gap-2"
      >
        Get started <ArrowRight className="h-4 w-4" />
      </button>

      <div className="grid grid-cols-3 gap-4 mt-10 pt-8 border-t border-slate-100">
        <Perk icon={<Sparkles className="h-4 w-4" />} label="45 days free" />
        <Perk icon={<Lock className="h-4 w-4" />} label="No card required" />
        <Perk icon={<Check className="h-4 w-4" />} label="Cancel anytime" />
      </div>
    </div>
  );
}

function Perk({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-xs text-slate-600">
      <span className="text-brand-600">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/* ---------------- Step 2: Company ---------------- */

function StepCompany({
  state, setField, onBack, onNext,
}: {
  state: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const canAdvance = state.companyName.trim().length >= 2 && state.companyType !== '';

  return (
    <div>
      <StepHeader
        icon={<Building2 className="h-5 w-5" />}
        eyebrow="About your company"
        title="Tell us about your business"
        subtitle="We'll use this to pre-configure the right modules."
      />

      <Field label="Company name" required>
        <input
          autoFocus
          value={state.companyName}
          onChange={(e) => setField('companyName', e.target.value)}
          placeholder="Acme Managed Services"
          className={inputClass}
        />
      </Field>

      <Field label="Team size">
        <div className="grid grid-cols-4 gap-2">
          {(['1-5', '6-20', '21-50', '50+'] as CompanySize[]).map((s) => (
            <Chip key={s} active={state.companySize === s} onClick={() => setField('companySize', s)}>
              {s}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="You are a..." required>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BigChoice
            active={state.companyType === 'msp'}
            onClick={() => setField('companyType', 'msp')}
            icon={<Wrench className="h-5 w-5" />}
            title="Managed Service Provider"
            desc="You bill clients for IT services"
          />
          <BigChoice
            active={state.companyType === 'internal_it'}
            onClick={() => setField('companyType', 'internal_it')}
            icon={<Server className="h-5 w-5" />}
            title="Internal IT Department"
            desc="You support your own company"
          />
        </div>
      </Field>

      <Field label="Industry (optional)">
        <select
          value={state.industry}
          onChange={(e) => setField('industry', e.target.value)}
          className={inputClass}
        >
          <option value="">Choose one…</option>
          <option>Technology</option>
          <option>Healthcare</option>
          <option>Finance / Banking</option>
          <option>Legal</option>
          <option>Manufacturing</option>
          <option>Education</option>
          <option>Retail</option>
          <option>Professional Services</option>
          <option>Non-profit</option>
          <option>Other</option>
        </select>
      </Field>

      <StepNav onBack={onBack} onNext={onNext} canAdvance={canAdvance} />
    </div>
  );
}

/* ---------------- Step 3: Contact ---------------- */

function StepContact({
  state, setField, onBack, onNext,
}: {
  state: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const canAdvance =
    state.firstName.trim() !== '' &&
    state.lastName.trim() !== '' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);

  return (
    <div>
      <StepHeader
        icon={<User className="h-5 w-5" />}
        eyebrow="About you"
        title="Who's setting this up?"
        subtitle="You'll be the first owner on the account. You can invite your team later."
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="First name" required>
          <input
            autoFocus
            value={state.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Last name" required>
          <input
            value={state.lastName}
            onChange={(e) => setField('lastName', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Work email" required>
        <input
          type="email"
          value={state.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="you@company.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Phone number"
        hint="Optional — only used if our team needs to reach you about billing or security issues."
      >
        <input
          type="tel"
          value={state.phone}
          onChange={(e) => setField('phone', e.target.value)}
          placeholder="+1 (555) 123-4567"
          className={inputClass}
        />
      </Field>

      <StepNav onBack={onBack} onNext={onNext} canAdvance={canAdvance} />
    </div>
  );
}

/* ---------------- Step 4: Configuration ---------------- */

function StepConfig({
  state, setField, onBack, onNext,
}: {
  state: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const isMsp = state.companyType === 'msp';

  return (
    <div>
      <StepHeader
        icon={<Briefcase className="h-5 w-5" />}
        eyebrow={isMsp ? 'How you bill' : 'How you operate'}
        title={isMsp ? 'Let\'s configure your billing' : 'Let\'s understand your environment'}
        subtitle={
          isMsp
            ? 'Your choices pre-fill the catalog and invoicing defaults — tweak anytime later.'
            : 'We\'ll tailor the workspace to internal IT workflows (no customer-facing billing UI).'
        }
      />

      {isMsp ? (
        <>
          <Field label="Do you bill clients?">
            <div className="grid grid-cols-2 gap-3">
              <BigChoice
                active={state.billsClients}
                onClick={() => setField('billsClients', true)}
                title="Yes"
                desc="I invoice clients for services"
              />
              <BigChoice
                active={!state.billsClients}
                onClick={() => setField('billsClients', false)}
                title="Not yet"
                desc="Just ticketing + tracking for now"
              />
            </div>
          </Field>

          {state.billsClients && (
            <>
              <Field label="Billing model">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { k: 'per_user', label: 'Per User' },
                    { k: 'per_device', label: 'Per Device' },
                    { k: 'flat_rate', label: 'Flat Rate' },
                    { k: 'hybrid', label: 'Hybrid' },
                  ] as const).map((o) => (
                    <Chip
                      key={o.k}
                      active={state.billingModel === o.k}
                      onClick={() => setField('billingModel', o.k)}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field
                label="Default hourly rate"
                hint="What you charge for billable labor. Defaults to $150 if you skip this."
              >
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={state.defaultHourlyRate}
                    onChange={(e) => setField('defaultHourlyRate', e.target.value)}
                    placeholder="150"
                    className={`${inputClass} pl-7`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">/ hour</span>
                </div>
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" hint="ISO code">
              <select
                value={state.currency}
                onChange={(e) => setField('currency', e.target.value)}
                className={inputClass}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
                <option value="AUD">AUD — Australian Dollar</option>
              </select>
            </Field>
            <Field label="Time zone" hint="Drives SLA timers">
              <select
                value={state.timezone}
                onChange={(e) => setField('timezone', e.target.value)}
                className={inputClass}
              >
                <option value="America/New_York">Eastern — New York</option>
                <option value="America/Chicago">Central — Chicago</option>
                <option value="America/Denver">Mountain — Denver</option>
                <option value="America/Los_Angeles">Pacific — Los Angeles</option>
                <option value="America/Phoenix">Arizona — Phoenix</option>
                <option value="America/Anchorage">Alaska — Anchorage</option>
                <option value="Pacific/Honolulu">Hawaii — Honolulu</option>
                <option value="Europe/London">UK — London</option>
                <option value="Europe/Dublin">Ireland — Dublin</option>
                <option value="Australia/Sydney">Australia — Sydney</option>
                {/* Keep the auto-detected value reachable even if not on the list */}
                {!['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu','Europe/London','Europe/Dublin','Australia/Sydney'].includes(state.timezone) && (
                  <option value={state.timezone}>{state.timezone} (detected)</option>
                )}
              </select>
            </Field>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start gap-3 mt-2">
            <Calculator className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600">
              Tax handling, per-client rate overrides, and accounting sync (QuickBooks) can all be configured
              from Settings once you're inside.
            </p>
          </div>
        </>
      ) : (
        <>
          <Field label="How many users or devices do you support?">
            <div className="grid grid-cols-2 gap-2">
              {(['1-50', '51-200', '201-1000', '1000+'] as SupportedUsersRange[]).map((r) => (
                <Chip
                  key={r}
                  active={state.supportedUsersRange === r}
                  onClick={() => setField('supportedUsersRange', r)}
                >
                  {r}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="What do you need most? (pick any)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { k: 'ticketing', label: 'Ticketing', icon: <Users2 className="h-4 w-4" /> },
                { k: 'asset_tracking', label: 'Asset tracking', icon: <Server className="h-4 w-4" /> },
                { k: 'change_management', label: 'Change management', icon: <Wrench className="h-4 w-4" /> },
                { k: 'knowledge_base', label: 'Knowledge base', icon: <Briefcase className="h-4 w-4" /> },
              ] as const).map((opt) => {
                const active = state.needs.includes(opt.k);
                return (
                  <button
                    key={opt.k}
                    onClick={() => {
                      const next = active ? state.needs.filter((n) => n !== opt.k) : [...state.needs, opt.k];
                      setField('needs', next);
                    }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      active ? 'bg-brand-50 border-brand-600 text-brand-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                    {active && <Check className="h-3.5 w-3.5 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Time zone">
            <select
              value={state.timezone}
              onChange={(e) => setField('timezone', e.target.value)}
              className={inputClass}
            >
              <option value="America/New_York">Eastern — New York</option>
              <option value="America/Chicago">Central — Chicago</option>
              <option value="America/Denver">Mountain — Denver</option>
              <option value="America/Los_Angeles">Pacific — Los Angeles</option>
              <option value="America/Phoenix">Arizona — Phoenix</option>
              <option value="Europe/London">UK — London</option>
              <option value="Australia/Sydney">Australia — Sydney</option>
              {!['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','Europe/London','Australia/Sydney'].includes(state.timezone) && (
                <option value={state.timezone}>{state.timezone} (detected)</option>
              )}
            </select>
          </Field>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start gap-3 mt-2">
            <Globe className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600">
              We'll hide client-billing features and focus the workspace on internal IT workflows.
            </p>
          </div>
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} canAdvance={true} />
    </div>
  );
}

/* ---------------- Step 5: Security ---------------- */

function StepSecurity({
  state, setField, onBack, onNext,
}: {
  state: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const pwOk = state.password.length >= 10;
  const match = state.password === state.confirmPassword && state.confirmPassword.length > 0;
  const canAdvance = pwOk && match;

  return (
    <div>
      <StepHeader
        icon={<Lock className="h-5 w-5" />}
        eyebrow="Secure your account"
        title="Choose a strong password"
        subtitle="At least 10 characters. You can enable passkeys and MFA once you're signed in."
      />

      <Field label="Password" required>
        <input
          autoFocus
          type="password"
          value={state.password}
          onChange={(e) => setField('password', e.target.value)}
          className={inputClass}
        />
        {state.password.length > 0 && (
          <p className={`text-xs mt-1 ${pwOk ? 'text-emerald-600' : 'text-amber-600'}`}>
            {pwOk ? '✓ Looks good' : `${Math.max(0, 10 - state.password.length)} more characters`}
          </p>
        )}
      </Field>

      <Field label="Confirm password" required>
        <input
          type="password"
          value={state.confirmPassword}
          onChange={(e) => setField('confirmPassword', e.target.value)}
          className={inputClass}
        />
        {state.confirmPassword.length > 0 && !match && (
          <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>
        )}
      </Field>

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-start gap-3 mt-2">
        <Lock className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
        <div className="text-sm text-brand-900">
          <strong>Multi-factor authentication</strong> can be turned on from Settings → Security after
          signup. Passkey login (WebAuthn) is supported too.
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} canAdvance={canAdvance} nextLabel="Review" />
    </div>
  );
}

/* ---------------- Step 6: Review ---------------- */

function StepReview({
  state, onBack, onSubmit, submitting, error,
}: {
  state: FormState;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  if (submitting) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white mb-6 shadow-lg shadow-brand-600/30 animate-pulse">
          <Hammer className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Forging your workspace…</h2>
        <p className="text-slate-600 mb-6">
          We're creating your tenant, seeding defaults, and preparing your account.
        </p>
        <div className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          This usually takes about 5 seconds.
        </div>
      </div>
    );
  }

  const isMsp = state.companyType === 'msp';

  return (
    <div>
      <StepHeader
        icon={<Sparkles className="h-5 w-5" />}
        eyebrow="Last step"
        title="Ready to launch?"
        subtitle="Here's what we'll set up for you. Edit anything from the previous steps, or launch when you're ready."
      />

      <div className="space-y-2 bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6 text-sm">
        <SummaryRow label="Company" value={state.companyName} />
        <SummaryRow label="Type" value={isMsp ? 'Managed Service Provider' : 'Internal IT Department'} />
        {state.companySize && <SummaryRow label="Team size" value={state.companySize} />}
        {state.industry && <SummaryRow label="Industry" value={state.industry} />}
        <SummaryRow label="Owner" value={`${state.firstName} ${state.lastName} (${state.email})`} />
        {state.phone && <SummaryRow label="Phone" value={state.phone} />}
        {isMsp && (
          <>
            <SummaryRow label="Billing" value={state.billsClients ? billingModelLabel(state.billingModel) : 'Not yet billing clients'} />
            {state.billsClients && state.defaultHourlyRate && (
              <SummaryRow label="Hourly rate" value={`$${state.defaultHourlyRate} ${state.currency}/hr`} />
            )}
            <SummaryRow label="Currency" value={state.currency} />
          </>
        )}
        {!isMsp && (
          <>
            {state.supportedUsersRange && <SummaryRow label="Supported users" value={state.supportedUsersRange} />}
            {state.needs.length > 0 && <SummaryRow label="Focus" value={state.needs.map(needLabel).join(', ')} />}
          </>
        )}
        <SummaryRow label="Time zone" value={state.timezone} />
      </div>

      <div className="mb-6 text-sm text-slate-600">
        <p className="font-semibold text-slate-900 mb-2">What we'll pre-configure:</p>
        <ul className="space-y-1.5">
          <PreCfg enabled>Default SLA policies (Standard + Premium)</PreCfg>
          <PreCfg enabled>Invoice, quote, and ticket numbering sequences</PreCfg>
          <PreCfg enabled>Email templates for customer communication</PreCfg>
          {isMsp && state.billsClients && state.billingModel && (
            <PreCfg enabled>Starter service catalog item — {billingModelLabel(state.billingModel)}</PreCfg>
          )}
          {isMsp && <PreCfg enabled>Default hourly rate: ${state.defaultHourlyRate || '150'}/hr</PreCfg>}
          {!isMsp && <PreCfg enabled>Client-billing UI hidden (Internal IT mode)</PreCfg>}
        </ul>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={onSubmit}
          className="flex-[2] bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20"
        >
          Launch my workspace <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-4 text-center">
        By launching you agree to our{' '}
        <a href="/terms" className="underline hover:text-slate-700">Terms</a> and{' '}
        <a href="/privacy" className="underline hover:text-slate-700">Privacy Policy</a>.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium text-right truncate">{value}</span>
    </div>
  );
}

function PreCfg({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Check className={`h-3.5 w-3.5 ${enabled ? 'text-brand-600' : 'text-slate-300'}`} />
      <span className={enabled ? 'text-slate-700' : 'text-slate-400 line-through'}>{children}</span>
    </li>
  );
}

function billingModelLabel(m: string): string {
  switch (m) {
    case 'per_user': return 'Per User';
    case 'per_device': return 'Per Device';
    case 'flat_rate': return 'Flat Rate';
    case 'hybrid': return 'Hybrid';
    default: return 'Custom';
  }
}

function needLabel(n: string): string {
  switch (n) {
    case 'ticketing': return 'Ticketing';
    case 'asset_tracking': return 'Asset tracking';
    case 'change_management': return 'Change management';
    case 'knowledge_base': return 'Knowledge base';
    default: return n;
  }
}

/* ---------------- Shared pieces ---------------- */

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none text-slate-900 bg-white';

function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="flex items-baseline justify-between text-sm font-medium text-slate-700 mb-1.5">
        <span>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {hint && <span className="text-xs text-slate-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
        active ? 'bg-brand-50 border-brand-600 text-brand-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function BigChoice({
  active, onClick, icon, title, desc,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-5 py-4 rounded-xl border-2 transition-all ${
        active
          ? 'bg-brand-50 border-brand-600 shadow-sm'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      {icon && (
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg mb-2 ${
          active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}>
          {icon}
        </div>
      )}
      <div className={`font-semibold mb-0.5 ${active ? 'text-brand-900' : 'text-slate-900'}`}>{title}</div>
      <div className="text-sm text-slate-600">{desc}</div>
    </button>
  );
}

function StepHeader({
  icon, eyebrow, title, subtitle,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-600 uppercase tracking-wide mb-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-50">
          {icon}
        </span>
        {eyebrow}
      </div>
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-600">{subtitle}</p>
    </div>
  );
}

function StepNav({
  onBack, onNext, canAdvance, nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  canAdvance: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
      <button
        onClick={onBack}
        className="flex-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        onClick={onNext}
        disabled={!canAdvance}
        className="flex-[2] bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
      >
        {nextLabel ?? 'Continue'} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
