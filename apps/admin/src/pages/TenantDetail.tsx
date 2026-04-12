import { useEffect, useState } from 'react';
import {
  ArrowLeft, Loader2, Users, Shield, CreditCard, History, LifeBuoy,
  UserCog, DollarSign, Flag, ExternalLink, AlertCircle, Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../App';
import { StatusBadge } from './Tenants';

interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string;
    planTier: 'starter' | 'pro' | 'enterprise';
    subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
    trialEndsAt: string | null;
    pastDueAt: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    companyType: 'msp' | 'internal_it';
    billingModel: string | null;
    currency: string;
    timezone: string;
    featureFlags: Record<string, boolean>;
    createdAt: string;
    settings: Record<string, unknown>;
  };
  users: Array<{
    id: string;
    email: string;
    displayName: string;
    role: string;
    isActive: boolean;
    isSuperAdmin: boolean;
  }>;
}

interface Activity {
  audits: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: string; changes: any }>;
  tickets: Array<{ id: string; ref: string; subject: string; status: string; category: string; createdAt: string }>;
}

const KNOWN_FLAGS = [
  { key: 'beta_ai_features', label: 'Beta AI features', desc: 'Unreleased AI tools for tickets and replies' },
  { key: 'beta_webhooks', label: 'Outbound webhooks', desc: 'Webhook delivery for ticket/invoice/customer events' },
  { key: 'enterprise_sso_preview', label: 'Enterprise SSO preview', desc: 'SAML / Microsoft SSO before general availability' },
  { key: 'custom_domain', label: 'Custom portal domain', desc: 'Allow the customer portal on a tenant subdomain' },
];

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<TenantDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<'overview' | 'users' | 'billing' | 'flags' | 'activity' | 'support'>('overview');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    const [detail, act] = await Promise.all([
      api<TenantDetail>(`/admin/tenants/${tenantId}`),
      api<Activity>(`/admin/tenants/${tenantId}/activity`),
    ]);
    setData(detail);
    setActivity(act);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  async function impersonate() {
    if (!confirm(`Impersonate ${data!.tenant.name}? An audit log entry will be created and your actions on app.forgepsa.com will be attributed to their owner (but flagged as impersonation).`)) return;
    setWorking(true);
    setMsg(null);
    try {
      const res = await api<{ accessToken: string; user: { email: string } }>(`/admin/tenants/${tenantId}/impersonate`, { method: 'POST' });
      const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';
      window.open(`${appUrl}/login#token=${encodeURIComponent(res.accessToken)}&imp=1`, '_blank', 'noopener');
      setMsg({ kind: 'ok', text: `Opening app as ${res.user.email} in a new tab…` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Impersonation failed.' });
    } finally {
      setWorking(false);
    }
  }

  async function setStatus(status: 'active' | 'trial' | 'past_due' | 'cancelled') {
    setWorking(true);
    setMsg(null);
    try {
      await api(`/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ subscriptionStatus: status }),
      });
      await load();
      setMsg({ kind: 'ok', text: `Status set to ${status}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setWorking(false);
    }
  }

  async function setPlan(plan: 'starter' | 'pro' | 'enterprise') {
    setWorking(true);
    setMsg(null);
    try {
      await api(`/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ planTier: plan }),
      });
      await load();
      setMsg({ kind: 'ok', text: `Plan set to ${plan}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setWorking(false);
    }
  }

  async function extendTrial(days: number) {
    setWorking(true);
    setMsg(null);
    try {
      await api(`/admin/tenants/${tenantId}/extend-trial`, {
        method: 'POST',
        body: JSON.stringify({ days }),
      });
      await load();
      setMsg({ kind: 'ok', text: `Trial extended ${days} days.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setWorking(false);
    }
  }

  async function toggleFlag(key: string) {
    const current = data!.tenant.featureFlags?.[key] ?? false;
    setWorking(true);
    setMsg(null);
    try {
      await api(`/admin/tenants/${tenantId}/feature-flags`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: !current }),
      });
      await load();
    } finally {
      setWorking(false);
    }
  }

  async function submitRefund() {
    if (!refundAmount || parseFloat(refundAmount) <= 0) return;
    const cents = Math.round(parseFloat(refundAmount) * 100);
    if (!confirm(`Refund $${(cents / 100).toFixed(2)} to ${data!.tenant.name}?`)) return;
    setWorking(true);
    setMsg(null);
    try {
      const res = await api<{ refundId: string }>(`/admin/tenants/${tenantId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amountCents: cents, reason: refundReason }),
      });
      setMsg({ kind: 'ok', text: `Refund issued: ${res.refundId}` });
      setRefundAmount('');
      setRefundReason('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Refund failed.' });
    } finally {
      setWorking(false);
    }
  }

  const t = data.tenant;

  return (
    <div>
      <button onClick={() => navigate('/tenants')} className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />
        All tenants
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">{t.name}</h1>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="font-mono">{t.slug}</span>
            <StatusBadge status={t.subscriptionStatus} />
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 font-medium">{t.planTier}</span>
            <span className="text-slate-500">• {t.companyType === 'msp' ? 'MSP' : 'Internal IT'}</span>
          </div>
        </div>
        <button
          onClick={impersonate}
          disabled={working}
          className="inline-flex items-center gap-2 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 text-amber-200 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <UserCog className="h-4 w-4" />
          Impersonate
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-md text-sm flex items-start gap-2 ${
          msg.kind === 'ok' ? 'bg-emerald-900/20 border border-emerald-900/50 text-emerald-200' : 'bg-red-900/20 border border-red-900/50 text-red-200'
        }`}>
          {msg.kind === 'ok' ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-800 flex gap-1 mb-6">
        {([
          { k: 'overview', l: 'Overview', i: <Shield className="h-4 w-4" /> },
          { k: 'users', l: `Users (${data.users.length})`, i: <Users className="h-4 w-4" /> },
          { k: 'billing', l: 'Billing', i: <CreditCard className="h-4 w-4" /> },
          { k: 'flags', l: 'Feature flags', i: <Flag className="h-4 w-4" /> },
          { k: 'activity', l: 'Activity', i: <History className="h-4 w-4" /> },
          { k: 'support', l: `Support (${activity?.tickets.length ?? 0})`, i: <LifeBuoy className="h-4 w-4" /> },
        ] as const).map(({ k, l, i }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === k ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {i} {l}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <InfoCard title="Details">
            <Row label="Company type" value={t.companyType === 'msp' ? 'Managed Service Provider' : 'Internal IT'} />
            {t.billingModel && <Row label="Billing model" value={t.billingModel.replace('_', ' ')} />}
            <Row label="Currency" value={t.currency} />
            <Row label="Time zone" value={t.timezone} />
            <Row label="Created" value={new Date(t.createdAt).toLocaleString()} />
          </InfoCard>
          <InfoCard title="Stripe">
            <Row
              label="Customer ID"
              value={t.stripeCustomerId ? (
                <a href={`https://dashboard.stripe.com/customers/${t.stripeCustomerId}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline inline-flex items-center gap-1 font-mono text-xs">
                  {t.stripeCustomerId}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : '—'}
            />
            <Row
              label="Subscription ID"
              value={t.stripeSubscriptionId ? (
                <a href={`https://dashboard.stripe.com/subscriptions/${t.stripeSubscriptionId}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline inline-flex items-center gap-1 font-mono text-xs">
                  {t.stripeSubscriptionId}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : '—'}
            />
            <Row label="Trial ends" value={t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleString() : '—'} />
            <Row label="Past-due since" value={t.pastDueAt ? new Date(t.pastDueAt).toLocaleString() : '—'} />
          </InfoCard>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-white font-medium">
                    {u.displayName}
                    {u.isSuperAdmin && <span className="ml-2 text-xs text-amber-400">(super-admin)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? <span className="text-emerald-400">✓</span> : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-4">
          <InfoCard title="Subscription status">
            <div className="flex flex-wrap gap-2">
              {(['active', 'trial', 'past_due', 'cancelled'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={working || t.subscriptionStatus === s}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                    t.subscriptionStatus === s ? 'bg-slate-700 text-white' : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </InfoCard>

          <InfoCard title="Plan">
            <div className="flex flex-wrap gap-2">
              {(['starter', 'pro', 'enterprise'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  disabled={working || t.planTier === p}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                    t.planTier === p ? 'bg-slate-700 text-white' : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </InfoCard>

          {t.subscriptionStatus === 'trial' && (
            <InfoCard title="Extend trial">
              <div className="flex flex-wrap gap-2">
                {[7, 15, 30, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => extendTrial(d)}
                    disabled={working}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                  >
                    +{d} days
                  </button>
                ))}
              </div>
            </InfoCard>
          )}

          <InfoCard title="Issue a refund">
            {!t.stripeCustomerId ? (
              <p className="text-sm text-slate-500">No Stripe customer yet. Refund is unavailable.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-sm text-white"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-sm text-white"
                  />
                </div>
                <button
                  onClick={submitRefund}
                  disabled={working || !refundAmount}
                  className="bg-red-900/30 hover:bg-red-900/50 disabled:opacity-40 border border-red-700/50 text-red-200 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Issue refund
                </button>
                <p className="text-xs text-slate-500">Refunds the most recent successful charge. Fully logged in the audit trail.</p>
              </div>
            )}
          </InfoCard>
        </div>
      )}

      {tab === 'flags' && (
        <InfoCard title="Per-tenant feature flags">
          <p className="text-sm text-slate-500 mb-4">
            Toggle experimental or plan-gated features on for this specific tenant, independent of their plan.
          </p>
          <div className="space-y-2">
            {KNOWN_FLAGS.map((f) => {
              const on = t.featureFlags?.[f.key] ?? false;
              return (
                <div key={f.key} className="flex items-start justify-between gap-4 py-2 border-b border-slate-800 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium">{f.label}</div>
                    <div className="text-xs text-slate-500">{f.desc}</div>
                    <div className="text-xs text-slate-600 font-mono mt-0.5">{f.key}</div>
                  </div>
                  <button
                    onClick={() => toggleFlag(f.key)}
                    disabled={working}
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                      on ? 'bg-brand-600' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      on ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </InfoCard>
      )}

      {tab === 'activity' && (
        <InfoCard title="Audit log (90 days)">
          {!activity || activity.audits.length === 0 ? (
            <p className="text-sm text-slate-500">No audit events.</p>
          ) : (
            <div className="space-y-1">
              {activity.audits.map((a) => (
                <div key={a.id} className="flex items-baseline gap-3 py-2 border-b border-slate-800 last:border-0 text-sm">
                  <span className="text-xs text-slate-500 font-mono shrink-0 w-36">{new Date(a.createdAt).toLocaleString()}</span>
                  <span className="text-white font-medium">{a.action}</span>
                  <span className="text-slate-500 text-xs font-mono truncate">{a.entityType}:{a.entityId.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      )}

      {tab === 'support' && (
        <InfoCard title="Support tickets">
          {!activity || activity.tickets.length === 0 ? (
            <p className="text-sm text-slate-500">No tickets submitted.</p>
          ) : (
            <div className="space-y-1">
              {activity.tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => navigate('/support')}
                  className="w-full text-left flex items-center gap-3 py-2 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 px-2 rounded transition-colors"
                >
                  <span className="text-xs font-mono text-slate-500 w-20">{ticket.ref}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{ticket.category}</span>
                  <span className="flex-1 text-sm text-white truncate">{ticket.subject}</span>
                  <span className="text-xs text-slate-500">{ticket.status}</span>
                </button>
              ))}
            </div>
          )}
        </InfoCard>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="text-sm font-semibold text-white mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-200 text-right truncate">{value}</span>
    </div>
  );
}
