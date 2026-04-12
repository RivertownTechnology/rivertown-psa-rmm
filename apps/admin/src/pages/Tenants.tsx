import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Calendar, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../App';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  planTier: 'starter' | 'pro' | 'enterprise';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  pastDueAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  userCount: number;
}

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Tenant['subscriptionStatus']>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const rows = await api<Tenant[]>('/admin/tenants');
    setTenants(rows);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    const q = query.toLowerCase().trim();
    return tenants.filter((t) => {
      if (statusFilter !== 'all' && t.subscriptionStatus !== statusFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
    });
  }, [tenants, query, statusFilter]);

  async function extendTrial(id: string) {
    setBusyId(id);
    try {
      await api(`/admin/tenants/${id}/extend-trial`, {
        method: 'POST',
        body: JSON.stringify({ days: 30 }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-bold text-white">Tenants</h1>
        <div className="text-sm text-slate-500">
          {filtered.length} of {tenants?.length ?? 0}
        </div>
      </div>
      <p className="text-slate-400 mb-6">Every MSP and internal-IT team on the platform.</p>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or slug…"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-sm text-white placeholder:text-slate-600"
            />
          </div>
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
          <FilterChip active={statusFilter === 'trial'} onClick={() => setStatusFilter('trial')}>Trial</FilterChip>
          <FilterChip active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>Active</FilterChip>
          <FilterChip active={statusFilter === 'past_due'} onClick={() => setStatusFilter('past_due')}>Past due</FilterChip>
          <FilterChip active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')}>Cancelled</FilterChip>
        </div>

        {/* Table */}
        {!tenants ? (
          <div className="py-16 flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading tenants…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No tenants match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Trial ends</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white flex items-center gap-1.5">
                        {t.name}
                        <ExternalLink className="h-3 w-3 text-slate-600" />
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 font-medium">
                        {t.planTier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.subscriptionStatus} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{t.userCount}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {t.subscriptionStatus === 'trial' && (
                        <button
                          onClick={() => extendTrial(t.id)}
                          disabled={busyId === t.id}
                          className="inline-flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded font-medium transition-colors"
                        >
                          <Calendar className="h-3 w-3" />
                          +30d
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-slate-700 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: Tenant['subscriptionStatus'] }) {
  const cfg: Record<Tenant['subscriptionStatus'], string> = {
    trial: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    past_due: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
