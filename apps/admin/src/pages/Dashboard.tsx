import { useEffect, useState } from 'react';
import { TrendingUp, Users, DollarSign, UserPlus, LifeBuoy, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface Metrics {
  tenants: { total: number; trial: number; active: number; pastDue: number; cancelled: number };
  mrrCents: number;
  signups: { thisMonth: number; lastMonth: number };
  openSupportTickets: number;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Metrics>('/admin/metrics').then(setMetrics).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-slate-400 mb-8">Platform health at a glance.</p>

      {loading || !metrics ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading metrics…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Monthly recurring revenue"
              value={`$${(metrics.mrrCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              hint={`${metrics.tenants.active} paying tenants`}
              accent="emerald"
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Total tenants"
              value={metrics.tenants.total.toLocaleString()}
              hint={`${metrics.tenants.trial} in trial`}
              accent="blue"
            />
            <StatCard
              icon={<UserPlus className="h-5 w-5" />}
              label="New signups this month"
              value={metrics.signups.thisMonth.toLocaleString()}
              hint={changeLabel(metrics.signups.thisMonth, metrics.signups.lastMonth)}
              accent="violet"
            />
            <StatCard
              icon={<LifeBuoy className="h-5 w-5" />}
              label="Open support tickets"
              value={metrics.openSupportTickets.toLocaleString()}
              hint={metrics.openSupportTickets > 0 ? 'Awaiting response' : 'All clear'}
              accent={metrics.openSupportTickets > 0 ? 'amber' : 'emerald'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusBreakdown metrics={metrics} />
            <Placeholder
              title="Churn / expansion"
              body="Cohort churn and expansion revenue charts ship here. Stripe event ingestion landing in a future build."
            />
          </div>
        </>
      )}
    </div>
  );
}

function changeLabel(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'First signups — no comparison' : 'No signups this or last month';
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  const arrow = delta >= 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(pct)}% vs last month (${previous})`;
}

function StatCard({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: 'emerald' | 'blue' | 'violet' | 'amber';
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue: 'bg-brand-500/10 text-brand-400',
    violet: 'bg-violet-500/10 text-violet-400',
    amber: 'bg-amber-500/10 text-amber-400',
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md mb-3 ${colors[accent]}`}>
        {icon}
      </div>
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function StatusBreakdown({ metrics }: { metrics: Metrics }) {
  const rows = [
    { label: 'Active', count: metrics.tenants.active, color: 'bg-emerald-500' },
    { label: 'Trial', count: metrics.tenants.trial, color: 'bg-brand-500' },
    { label: 'Past due', count: metrics.tenants.pastDue, color: 'bg-amber-500' },
    { label: 'Cancelled', count: metrics.tenants.cancelled, color: 'bg-red-500' },
  ];
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
        <TrendingUp className="h-4 w-4 text-slate-400" />
        Subscription status breakdown
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-300">{r.label}</span>
              <span className="text-slate-400">{r.count} {total > 0 && `(${Math.round((r.count / total) * 100)}%)`}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full ${r.color}`}
                style={{ width: total > 0 ? `${(r.count / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="text-sm font-semibold text-white mb-2">{title}</div>
      <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
