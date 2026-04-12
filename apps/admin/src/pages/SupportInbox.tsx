import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, Circle, XCircle, Mail } from 'lucide-react';
import { api } from '../lib/api';

interface Ticket {
  id: string;
  ref: string;
  tenantId: string | null;
  tenantName: string | null;
  userEmail: string;
  category: 'bug' | 'question' | 'feature' | 'billing';
  subject: string;
  status: 'open' | 'replied' | 'closed';
  emailSent: boolean;
  createdAt: string;
  closedAt: string | null;
}

interface TicketDetail extends Ticket {
  body: string;
  userId: string | null;
  updatedAt: string;
}

export function SupportInboxPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [filter, setFilter] = useState<'open' | 'replied' | 'closed' | 'all'>('open');
  const [working, setWorking] = useState(false);

  async function load() {
    const rows = await api<Ticket[]>(`/admin/support-tickets?status=${filter}`);
    setTickets(rows);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function openTicket(id: string) {
    const detail = await api<TicketDetail>(`/admin/support-tickets/${id}`);
    setSelected(detail);
  }

  async function setStatus(id: string, status: 'open' | 'replied' | 'closed') {
    setWorking(true);
    try {
      await api(`/admin/support-tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      if (selected?.id === id) {
        setSelected({ ...selected, status });
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">Support inbox</h1>
      <p className="text-slate-400 mb-6">Tickets submitted by tenants through the in-app help portal.</p>

      <div className="flex gap-2 mb-4">
        {(['open', 'replied', 'closed', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelected(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_1.5fr] gap-4">
        {/* List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {!tickets ? (
            <div className="py-16 flex items-center justify-center text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">No tickets.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors ${
                    selected?.id === t.id ? 'bg-slate-800/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <StatusIcon status={t.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{t.subject}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{t.ref}</span>
                        <span>•</span>
                        <span>{t.category}</span>
                        <span>•</span>
                        <span className="truncate">{t.tenantName ?? 'Unknown tenant'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 pl-6">
                    {t.userEmail} · {new Date(t.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 min-h-[400px]">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Select a ticket to read the body.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 font-mono mb-1">{selected.ref}</div>
                  <h2 className="text-lg font-semibold text-white">{selected.subject}</h2>
                  <div className="text-xs text-slate-500 mt-1">
                    {selected.category} · {selected.userEmail} · {new Date(selected.createdAt).toLocaleString()}
                  </div>
                  {selected.tenantName && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Tenant: <span className="text-slate-300">{selected.tenantName}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-md p-4 mb-4 whitespace-pre-wrap text-sm text-slate-200 leading-relaxed font-mono">
                {selected.body}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <a
                  href={`mailto:${selected.userEmail}?subject=Re:%20%5B${selected.ref}%5D%20${encodeURIComponent(selected.subject)}`}
                  className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Reply via email
                </a>
                {selected.status !== 'replied' && (
                  <button
                    onClick={() => setStatus(selected.id, 'replied')}
                    disabled={working}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    Mark replied
                  </button>
                )}
                {selected.status !== 'closed' && (
                  <button
                    onClick={() => setStatus(selected.id, 'closed')}
                    disabled={working}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    Close ticket
                  </button>
                )}
                {selected.status === 'closed' && (
                  <button
                    onClick={() => setStatus(selected.id, 'open')}
                    disabled={working}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    Reopen
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-600 border-t border-slate-800 pt-3">
                Email delivery to support@forgepsa.com: {selected.emailSent ? (
                  <span className="text-emerald-400">sent ✓</span>
                ) : (
                  <span className="text-amber-400">pending / failed</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Ticket['status'] }) {
  if (status === 'closed') return <XCircle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />;
  if (status === 'replied') return <CheckCircle className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />;
  return <Circle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />;
}

function StatusBadge({ status }: { status: Ticket['status'] }) {
  const cfg: Record<Ticket['status'], string> = {
    open: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    replied: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
    closed: 'bg-slate-700/50 text-slate-400 border-slate-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg[status]}`}>
      {status}
    </span>
  );
}
