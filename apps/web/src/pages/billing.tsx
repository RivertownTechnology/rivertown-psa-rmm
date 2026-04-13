import { useEffect, useState } from 'react';
import {
  CreditCard, Check, Lock, Calendar, FileText, AlertCircle, Loader2,
  Plus, Trash2, ArrowUpCircle, ArrowDownCircle, ExternalLink, X, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

type PlanId = 'starter' | 'pro' | 'enterprise';

interface SubscriptionSnapshot {
  plan: PlanId;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  pastDueAt: string | null;
  currency: string;
  stripeCustomerId: string | null;
  hasSubscription: boolean;
  subscription?: {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    quantity: number;
    unitAmountCents: number;
    interval: string;
  };
  defaultPaymentMethod?: {
    id: string; brand: string; last4: string; expMonth: number; expYear: number;
  };
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
}

const PLAN_INFO: Record<PlanId, { name: string; priceCents: number; features: string[] }> = {
  starter: {
    name: 'Starter',
    priceCents: 4900,
    features: [
      'Up to 3 techs',
      'All core PSA features',
      'NinjaRMM integration',
      'Pax8 license sync',
      'Stripe payment links',
      'Google SSO',
    ],
  },
  pro: {
    name: 'Pro',
    priceCents: 7900,
    features: [
      '4–15 techs',
      'Everything in Starter',
      'QuickBooks + ConnectBooster + CrewHu',
      'AI assistant + SLA policies',
      'Twilio SMS + Microsoft SSO',
      'ConnectWise / CSV data import',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceCents: 0,
    features: [
      '16+ techs',
      'SAML SSO',
      'Dedicated instance',
      'Custom portal subdomain',
      'Named CSM + priority SLA',
    ],
  },
};

// Cache the Stripe.js promise per publishable key across the app lifetime
let stripePromise: Promise<Stripe | null> | null = null;
let stripePromiseKey: string | null = null;
function getStripe(key: string) {
  if (!key) return null;
  if (stripePromise && stripePromiseKey === key) return stripePromise;
  stripePromiseKey = key;
  stripePromise = loadStripe(key);
  return stripePromise;
}

export function BillingPage({ forced = false }: { forced?: boolean }) {
  const { user, logout } = useAuth();
  const [sub, setSub] = useState<SubscriptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isLocked = forced || user?.lockedOut;
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  async function refresh() {
    setLoading(true);
    try {
      const s = await api<SubscriptionSnapshot>('/billing/subscription');
      setSub(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Billing access restricted</h1>
        <p className="text-muted-foreground">Only tenant owners and admins can manage billing. Ask your owner for access.</p>
      </div>
    );
  }

  return (
    <div className={isLocked ? 'min-h-screen bg-muted/30 flex flex-col' : ''}>
      {isLocked && <LockoutBanner subStatus={sub?.status} onLogout={logout} />}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Billing</h1>
        <p className="text-muted-foreground mb-6">Manage your subscription, payment methods, and invoices.</p>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading || !sub ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : !sub.hasSubscription ? (
          <ChoosePlan onPicked={refresh} currentPlan={sub.plan} />
        ) : (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="payment">Payment methods</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="plan">Change plan</TabsTrigger>
              <TabsTrigger value="cancel">Cancel</TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><Overview sub={sub} onRefresh={refresh} /></TabsContent>
            <TabsContent value="payment"><PaymentMethods onDefaultChange={refresh} /></TabsContent>
            <TabsContent value="invoices"><Invoices /></TabsContent>
            <TabsContent value="plan"><ChangePlan sub={sub} onChanged={refresh} /></TabsContent>
            <TabsContent value="cancel"><CancelSection sub={sub} onChanged={refresh} /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function LockoutBanner({ subStatus, onLogout }: { subStatus?: string; onLogout: () => void }) {
  return (
    <div className="bg-red-600 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4" />
          <span>
            {subStatus === 'cancelled' ? 'Your subscription was cancelled.'
              : subStatus === 'trial' ? 'Your free trial has ended.'
              : 'Your payment failed and the 30-day grace period has passed.'}
            {' '}Add a subscription to re-activate.
          </span>
        </div>
        <button onClick={onLogout} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md font-semibold">
          Sign out
        </button>
      </div>
    </div>
  );
}

/* ---------------- Choose Plan (no subscription yet) ---------------- */

function ChoosePlan({ currentPlan, onPicked }: { currentPlan: PlanId; onPicked: () => void }) {
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(plan: PlanId) {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@forgepsa.com?subject=Enterprise%20plan%20inquiry';
      return;
    }
    setLoading(plan);
    setError(null);
    try {
      const res = await api<{ checkoutUrl?: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
      else setError('Checkout is not available yet. Contact support@forgepsa.com.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setLoading(null);
      onPicked();
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Pick a plan to activate your account</h2>
      {error && <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-3">
        {(Object.keys(PLAN_INFO) as PlanId[]).map((id) => (
          <Card key={id} className={id === 'pro' ? 'border-primary shadow-lg' : ''}>
            <CardHeader>
              {id === 'pro' && (
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary mb-1">
                  <Star className="h-3 w-3" /> MOST POPULAR
                </div>
              )}
              <CardTitle className="flex items-baseline justify-between">
                <span>{PLAN_INFO[id].name}</span>
                <span className="text-3xl font-bold">
                  {PLAN_INFO[id].priceCents === 0 ? 'Custom' : `$${PLAN_INFO[id].priceCents / 100}`}
                </span>
              </CardTitle>
              <CardDescription>{PLAN_INFO[id].priceCents === 0 ? '16+ techs' : 'per tech / month'}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6 text-sm">
                {PLAN_INFO[id].features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => pick(id)}
                disabled={loading !== null}
                className="w-full"
                variant={id === 'pro' ? 'default' : 'outline'}
              >
                {loading === id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                {id === 'enterprise' ? 'Contact sales' : id === currentPlan ? `Choose ${PLAN_INFO[id].name}` : `Upgrade to ${PLAN_INFO[id].name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ sub, onRefresh }: { sub: SubscriptionSnapshot; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  async function reactivate() {
    setLoading(true);
    try {
      await api('/billing/reactivate', { method: 'POST' });
      onRefresh();
    } finally { setLoading(false); }
  }

  const monthlyCents = (sub.subscription?.unitAmountCents ?? 0) * (sub.subscription?.quantity ?? 1);
  const periodEnd = sub.subscription?.currentPeriodEnd ? new Date(sub.subscription.currentPeriodEnd) : null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold capitalize">{PLAN_INFO[sub.plan]?.name ?? sub.plan}</span>
            {monthlyCents > 0 && (
              <span className="text-lg text-muted-foreground">
                ${(monthlyCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} / {sub.subscription?.interval}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {sub.subscription?.quantity} tech {sub.subscription?.quantity === 1 ? 'seat' : 'seats'} at ${(sub.subscription?.unitAmountCents ?? 0) / 100} each
          </div>
          <StatusBadge status={sub.status} />
          {sub.subscription?.cancelAtPeriodEnd && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-2">
              <div className="font-medium text-amber-900">
                Subscription will cancel on {periodEnd?.toLocaleDateString()}.
              </div>
              <Button size="sm" onClick={reactivate} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Reactivate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {periodEnd ? (
            <>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {periodEnd.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-sm text-muted-foreground">
                {Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days from today
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Not available.</div>
          )}
          {sub.defaultPaymentMethod && (
            <div className="text-sm pt-2 border-t">
              <div className="text-muted-foreground mb-1">Billing to</div>
              <div className="font-medium capitalize">
                {sub.defaultPaymentMethod.brand} •••• {sub.defaultPaymentMethod.last4}
              </div>
              <div className="text-xs text-muted-foreground">
                Expires {String(sub.defaultPaymentMethod.expMonth).padStart(2, '0')}/{String(sub.defaultPaymentMethod.expYear).slice(-2)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: SubscriptionSnapshot['status'] }) {
  const map: Record<SubscriptionSnapshot['status'], string> = {
    active: 'bg-green-100 text-green-800 border-green-200',
    trial: 'bg-blue-100 text-blue-800 border-blue-200',
    past_due: 'bg-amber-100 text-amber-800 border-amber-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/* ---------------- Payment Methods ---------------- */

function PaymentMethods({ onDefaultChange }: { onDefaultChange: () => void }) {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{ methods: PaymentMethod[]; defaultId: string | null }>('/billing/payment-methods');
    setMethods(res.methods);
  }
  useEffect(() => { load(); }, []);

  async function setDefault(id: string) {
    setBusyId(id);
    try {
      await api('/billing/default-payment-method', {
        method: 'PUT',
        body: JSON.stringify({ paymentMethodId: id }),
      });
      await load();
      onDefaultChange();
    } finally { setBusyId(null); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this payment method?')) return;
    setBusyId(id);
    try {
      await api(`/billing/payment-methods/${id}`, { method: 'DELETE' });
      await load();
    } finally { setBusyId(null); }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Payment methods</CardTitle>
          <CardDescription>Cards saved for automatic renewals.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add card
        </Button>
      </CardHeader>
      <CardContent>
        {!methods ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No cards on file.</p>
        ) : (
          <ul className="divide-y">
            {methods.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize">
                      {m.brand} •••• {m.last4}
                      {m.isDefault && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">default</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Expires {String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!m.isDefault && (
                    <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => setDefault(m.id)}>
                      Make default
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" disabled={busyId === m.id} onClick={() => remove(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {adding && <AddCardModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
      </CardContent>
    </Card>
  );
}

function AddCardModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ clientSecret: string; publishableKey: string }>('/billing/setup-intent', { method: 'POST' })
      .then((r) => { setClientSecret(r.clientSecret); setPublishableKey(r.publishableKey); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to initialize.'));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Add payment method</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : !clientSecret || !publishableKey ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Preparing secure form…
            </div>
          ) : (
            <StripeElementsWrapper
              publishableKey={publishableKey}
              clientSecret={clientSecret}
              onAdded={onAdded}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StripeElementsWrapper({
  publishableKey, clientSecret, onAdded, onClose,
}: {
  publishableKey: string;
  clientSecret: string;
  onAdded: () => void;
  onClose: () => void;
}) {
  const stripe = getStripe(publishableKey);
  if (!stripe) return <div className="text-sm text-destructive">Stripe key invalid.</div>;
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <AddCardForm onAdded={onAdded} onClose={onClose} />
    </Elements>
  );
}

function AddCardForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/billing?setup=done` },
      redirect: 'if_required',
    });
    if (stripeError) {
      setError(stripeError.message ?? 'Failed to save card.');
      setSubmitting(false);
    } else {
      onAdded();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save card
        </Button>
      </div>
    </form>
  );
}

/* ---------------- Invoices ---------------- */

function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    api<{ invoices: Invoice[] }>('/billing/invoices').then((r) => setInvoices(r.invoices));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoices</CardTitle>
        <CardDescription>Your last 20 invoices from ForgePSA.</CardDescription>
      </CardHeader>
      <CardContent>
        {!invoices ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <tr>
                <th className="pb-2 font-medium">Invoice</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="py-3 font-mono text-xs">{i.number ?? i.id.slice(-8)}</td>
                  <td className="py-3 text-muted-foreground">{new Date(i.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 font-medium">
                    {(i.amountCents / 100).toLocaleString(undefined, {
                      style: 'currency', currency: i.currency.toUpperCase(),
                    })}
                  </td>
                  <td className="py-3">
                    <InvoiceStatus status={i.status} />
                  </td>
                  <td className="py-3 text-right">
                    {i.hostedInvoiceUrl && (
                      <a href={i.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceStatus({ status }: { status: string | null }) {
  const s = status ?? 'draft';
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800 border-green-200',
    open: 'bg-amber-100 text-amber-800 border-amber-200',
    void: 'bg-slate-100 text-slate-600 border-slate-200',
    uncollectible: 'bg-red-100 text-red-800 border-red-200',
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${map[s] ?? map.draft}`}>
      {s}
    </span>
  );
}

/* ---------------- Change Plan ---------------- */

function ChangePlan({ sub, onChanged }: { sub: SubscriptionSnapshot; onChanged: () => void }) {
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(plan: PlanId) {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@forgepsa.com?subject=Enterprise%20plan%20inquiry';
      return;
    }
    if (plan === sub.plan) return;
    const isUpgrade = plan === 'pro' && sub.plan === 'starter';
    const msg = isUpgrade
      ? `Upgrade to Pro? You'll be charged a prorated amount today and ${(PLAN_INFO.pro.priceCents / 100)} per seat from your next renewal.`
      : `Downgrade to Starter? You'll lose access to Pro features. A credit will be applied to your next invoice.`;
    if (!confirm(msg)) return;
    setLoading(plan);
    setError(null);
    try {
      await api('/billing/subscription', {
        method: 'PUT',
        body: JSON.stringify({ plan }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan change failed.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}
      <div className="grid lg:grid-cols-3 gap-4">
        {(Object.keys(PLAN_INFO) as PlanId[]).map((id) => {
          const current = sub.plan === id;
          return (
            <Card key={id} className={current ? 'border-primary' : ''}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span className="capitalize">{PLAN_INFO[id].name}</span>
                  <span className="text-2xl font-bold">
                    {PLAN_INFO[id].priceCents === 0 ? 'Custom' : `$${PLAN_INFO[id].priceCents / 100}`}
                  </span>
                </CardTitle>
                <CardDescription>{PLAN_INFO[id].priceCents === 0 ? '16+ techs' : 'per tech / month'}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4 text-sm">
                  {PLAN_INFO[id].features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                {current ? (
                  <Button disabled className="w-full" variant="outline">
                    <Check className="h-4 w-4 mr-2" /> Your current plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => switchTo(id)}
                    disabled={loading !== null}
                    variant={id === 'pro' && sub.plan === 'starter' ? 'default' : 'outline'}
                    className="w-full"
                  >
                    {loading === id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : id === 'enterprise' ? null
                    : id === 'pro' && sub.plan === 'starter' ? <ArrowUpCircle className="h-4 w-4 mr-2" />
                    : <ArrowDownCircle className="h-4 w-4 mr-2" />}
                    {id === 'enterprise' ? 'Contact sales'
                      : id === 'pro' && sub.plan === 'starter' ? 'Upgrade to Pro'
                      : 'Downgrade to Starter'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Plan changes take effect immediately. Pro-rated charges or credits are applied at your next renewal.
      </p>
    </div>
  );
}

/* ---------------- Cancel ---------------- */

function CancelSection({ sub, onChanged }: { sub: SubscriptionSnapshot; onChanged: () => void }) {
  const [mode, setMode] = useState<'at_period_end' | 'immediately'>('at_period_end');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodEnd = sub.subscription?.currentPeriodEnd ? new Date(sub.subscription.currentPeriodEnd) : null;
  const alreadyCancelled = sub.subscription?.cancelAtPeriodEnd;

  async function cancel() {
    const confirmMsg = mode === 'immediately'
      ? 'Cancel immediately? Your account locks right away and we do NOT issue a refund for the remainder of the billing period.'
      : `Cancel at the end of your billing period (${periodEnd?.toLocaleDateString()})? You keep full access until then.`;
    if (!confirm(confirmMsg)) return;
    setLoading(true);
    setError(null);
    try {
      await api('/billing/cancel', {
        method: 'POST',
        body: JSON.stringify({ mode, reason: reason.trim() || undefined }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation failed.');
    } finally {
      setLoading(false);
    }
  }

  if (alreadyCancelled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription cancellation pending</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">
            Your subscription is set to cancel on{' '}
            <strong>{periodEnd?.toLocaleDateString()}</strong>. You have full access until then.
          </p>
          <Button
            onClick={async () => {
              setLoading(true);
              try { await api('/billing/reactivate', { method: 'POST' }); onChanged(); }
              finally { setLoading(false); }
            }}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reactivate subscription
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Cancel subscription
        </CardTitle>
        <CardDescription>We'll be sorry to see you go. Let us know what we could do better.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">When should this take effect?</label>
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              onClick={() => setMode('at_period_end')}
              className={`text-left px-4 py-3 rounded-md border ${mode === 'at_period_end' ? 'border-primary bg-primary/5' : 'border-input'}`}
            >
              <div className="font-medium text-sm">At the end of billing period</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Full access until {periodEnd?.toLocaleDateString() ?? '—'}
              </div>
            </button>
            <button
              onClick={() => setMode('immediately')}
              className={`text-left px-4 py-3 rounded-md border ${mode === 'immediately' ? 'border-destructive bg-destructive/5' : 'border-input'}`}
            >
              <div className="font-medium text-sm text-destructive">Immediately</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Locks right away. No refund for unused time.
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="cancel-reason" className="text-sm font-medium">Reason <span className="text-muted-foreground font-normal">(optional — helps us improve)</span></label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            placeholder="What led to this decision?"
            maxLength={500}
          />
        </div>

        {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}

        <Button variant="destructive" onClick={cancel} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Cancel subscription
        </Button>
      </CardContent>
    </Card>
  );
}
