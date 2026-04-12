import { useState } from 'react';
import { Check, CreditCard, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type PlanId = 'starter' | 'pro' | 'enterprise';

const PLANS: { id: PlanId; name: string; price: string; priceSuffix: string; features: string[]; featured?: boolean }[] = [
  {
    id: 'starter', name: 'Starter', price: '$49', priceSuffix: 'per tech / month',
    features: ['Up to 3 techs', 'All core PSA + RMM features', 'Stripe payment links', 'Email support'],
  },
  {
    id: 'pro', name: 'Pro', price: '$79', priceSuffix: 'per tech / month', featured: true,
    features: ['4–15 techs', 'All integrations', 'AI ticket assistant', 'SLA policies', 'Priority support'],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'Custom', priceSuffix: '16+ techs',
    features: ['SAML 2.0 SSO', 'Dedicated instance option', 'Custom SLA', 'Named CSM'],
  },
];

export function BillingPage({ forced = false }: { forced?: boolean }) {
  const { user, logout } = useAuth();
  const [selected, setSelected] = useState<PlanId>(user?.planTier ?? 'pro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = user?.subscriptionStatus;
  const isLocked = forced || user?.lockedOut;

  async function startCheckout(plan: PlanId) {
    setError(null);
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@forgepsa.com?subject=Enterprise%20plan%20inquiry';
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ checkoutUrl?: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setError('Checkout is not yet available. Contact support@forgepsa.com to activate your plan.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setLoading(false);
    }
  }

  async function openBillingPortal() {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ portalUrl?: string }>('/billing/portal', { method: 'POST' });
      if (res.portalUrl) window.location.href = res.portalUrl;
      else setError('Billing portal is not yet available.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing portal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={isLocked ? 'min-h-screen bg-slate-50 flex flex-col' : ''}>
      {isLocked && (
        <div className="bg-red-600 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4" />
              <span>
                {status === 'cancelled'
                  ? 'Your subscription was cancelled.'
                  : status === 'trial'
                    ? 'Your free trial has ended.'
                    : 'Your payment could not be processed and the 30-day grace period has passed.'}
                {' '}Add a subscription to re-activate your ForgePSA account.
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md font-semibold"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Billing & subscription</h1>
            <p className="text-slate-600">
              {status === 'active'
                ? `You're on the ${user?.planTier ?? 'starter'} plan.`
                : status === 'past_due'
                  ? 'Your last payment failed. Update billing to keep your account active.'
                  : 'Pick a plan to activate your ForgePSA account.'}
            </p>
          </div>
          {(status === 'active' || status === 'past_due') && (
            <Button variant="outline" onClick={openBillingPortal} disabled={loading}>
              <CreditCard className="h-4 w-4 mr-2" />
              Manage billing
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <Card
              key={p.id}
              className={`${p.featured ? 'border-primary shadow-lg lg:scale-105' : ''} ${
                selected === p.id ? 'ring-2 ring-primary' : ''
              }`}
            >
              <CardHeader>
                {p.featured && (
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary mb-1">
                    <Sparkles className="h-3 w-3" /> MOST POPULAR
                  </div>
                )}
                <CardTitle className="flex items-baseline justify-between">
                  <span>{p.name}</span>
                  <span className="text-3xl font-bold">{p.price}</span>
                </CardTitle>
                <CardDescription>{p.priceSuffix}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6 text-sm">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => { setSelected(p.id); startCheckout(p.id); }}
                  disabled={loading}
                  className="w-full"
                  variant={p.featured ? 'default' : 'outline'}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {p.id === 'enterprise' ? 'Contact sales' : loading && selected === p.id ? 'Redirecting…' : 'Choose plan'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-slate-500 text-center mt-8">
          Questions about billing? Email <a href="mailto:support@forgepsa.com" className="underline">support@forgepsa.com</a>.
        </p>
      </div>
    </div>
  );
}
