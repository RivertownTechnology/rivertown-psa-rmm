import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Headset, LogOut, Ticket, FileText, Receipt, Monitor, Plus, User,
  MessageSquare, ChevronLeft, Send, Users, Shield, ShieldCheck, Check, X,
  Settings as SettingsIcon, KeyRound, Fingerprint, Trash2, CreditCard,
} from 'lucide-react';

// ===== Types =====

interface TicketData {
  id: string; ticketNumber: number; subject: string; description: string | null;
  status: string; priority: string; createdAt: string; updatedAt: string;
}
interface Comment { id: string; authorType: string; body: string; createdAt: string; }
interface InvoiceData {
  id: string; invoiceNumber: number; status: string; issueDate: string; dueDate: string;
  subtotalCents: number; taxCents: number; totalCents: number; amountPaidCents: number;
}
interface QuoteData {
  id: string; quoteNumber: number; title: string; status: string; totalCents: number; createdAt: string;
}
interface AssetData { id: string; name: string; type: string; serialNumber: string | null; status: string; }
interface PortalUserData {
  id: string; firstName: string; lastName: string; email: string;
  portalEnabled: boolean; portalRole: string | null; portalPermissions: string[] | null;
}
interface Category { id: string; name: string; subcategories: Array<{ id: string; name: string }> }
interface Stats { tickets: { open: number; total: number }; invoices: { outstanding: number; outstandingCents: number } }

type TabId = 'tickets' | 'invoices' | 'quotes' | 'assets' | 'admin' | 'settings';

// ===== Helpers =====

const statusStyle: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800', open: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800', waiting_on_customer: 'bg-purple-100 text-purple-800',
  scheduled: 'bg-indigo-100 text-indigo-800', resolved: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-100 text-gray-500', draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-800', paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800', cancelled: 'bg-gray-100 text-gray-500',
  approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800',
};

function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtTime(d: string) { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

// ===== Main Component =====

interface DashboardBranding {
  businessName: string;
  businessLogo: string;
}

interface DashboardProps {
  userName: string;
  portalRole: string;
  portalPermissions: string[];
  branding?: DashboardBranding | null;
  onLogout: () => void;
}

export function Dashboard({ userName, portalRole, portalPermissions, branding, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('tickets');
  const [stats, setStats] = useState<Stats | null>(null);
  const isAdmin = portalRole === 'admin';
  const hasTickets = isAdmin || portalPermissions.includes('tickets');
  const hasBilling = isAdmin || portalPermissions.includes('billing');

  useEffect(() => {
    api<Stats>('/portal/stats').then(setStats).catch(() => {});
  }, []);

  const tabs: { id: TabId; label: string; icon: typeof Ticket; visible: boolean }[] = [
    { id: 'tickets', label: 'Tickets', icon: Ticket, visible: hasTickets },
    { id: 'invoices', label: 'Invoices', icon: Receipt, visible: hasBilling },
    { id: 'quotes', label: 'Quotes', icon: FileText, visible: hasBilling },
    { id: 'assets', label: 'Assets', icon: Monitor, visible: true },
    { id: 'admin', label: 'Users', icon: Users, visible: isAdmin },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, visible: true },
  ];

  const visibleTabs = tabs.filter(t => t.visible);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {branding?.businessLogo ? (
              <img src={branding.businessLogo} alt={branding.businessName || 'Portal'} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Headset className="h-4 w-4" />
              </div>
            )}
            <span className="text-lg font-semibold">{branding?.businessName || 'Support Portal'}</span>
          </div>
          <div className="flex items-center gap-3">
            {userName && (
              <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                <User className="h-3.5 w-3.5" />
                {userName}
                {isAdmin && <Badge variant="outline" className="text-xs ml-1">Admin</Badge>}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Welcome'}
          </h1>
          <p className="text-muted-foreground">Manage your support requests, invoices, and account.</p>
        </div>

        {/* Quick stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {hasTickets && <QuickStat label="Open Tickets" value={String(stats?.tickets.open ?? '--')} />}
          {hasTickets && <QuickStat label="Total Tickets" value={String(stats?.tickets.total ?? '--')} />}
          {hasBilling && <QuickStat label="Unpaid Invoices" value={String(stats?.invoices.outstanding ?? '--')} />}
          {hasBilling && <QuickStat label="Outstanding" value={stats ? formatCents(stats.invoices.outstandingCents) : '--'} />}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'tickets' && hasTickets && <TicketsTab />}
        {activeTab === 'invoices' && hasBilling && <InvoicesTab />}
        {activeTab === 'quotes' && hasBilling && <QuotesTab />}
        {activeTab === 'assets' && <AssetsTab />}
        {activeTab === 'admin' && isAdmin && <AdminTab />}
        {activeTab === 'settings' && <SettingsTab isAdmin={isAdmin} />}
      </main>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </CardContent></Card>
  );
}

// ===== TICKETS TAB =====

function TicketsTab() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api<TicketData[]>('/portal/tickets').then(d => { setTickets(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selected) return <TicketDetail ticketId={selected} onBack={() => { setSelected(null); load(); }} />;
  if (showNew) return <NewTicket onBack={() => { setShowNew(false); load(); }} />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Tickets</CardTitle>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />New Ticket</Button>
      </CardHeader>
      <CardContent>
        {!loaded ? <p className="text-center py-8 text-muted-foreground">Loading...</p> :
         tickets.length === 0 ? (
          <EmptyState icon={Ticket} title="No tickets yet" description="Submit a support request and it will appear here." />
        ) : (
          <div className="space-y-2">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">#{t.ticketNumber}</span>
                      <Badge className={`text-xs ${statusStyle[t.status] ?? ''}`}>{t.status.replace(/_/g, ' ')}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{t.priority}</Badge>
                    </div>
                    <div className="font-medium truncate">{t.subject}</div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(t.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<TicketData>(`/portal/tickets/${ticketId}`).then(setTicket).catch(() => {});
    api<Comment[]>(`/portal/tickets/${ticketId}/comments`).then(setComments).catch(() => {});
  }, [ticketId]);

  async function sendComment() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api(`/portal/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify({ body: body.trim() }) });
      setBody('');
      const updated = await api<Comment[]>(`/portal/tickets/${ticketId}/comments`);
      setComments(updated);
    } finally { setSending(false); }
  }

  if (!ticket) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back to Tickets</Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
            <Badge className={`text-xs ${statusStyle[ticket.status] ?? ''}`}>{ticket.status.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline" className="text-xs capitalize">{ticket.priority}</Badge>
          </div>
          <CardTitle>{ticket.subject}</CardTitle>
          <p className="text-xs text-muted-foreground">Opened {fmtTime(ticket.createdAt)}</p>
        </CardHeader>
        {ticket.description && (
          <CardContent className="border-t pt-4">
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Comments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>}
          {comments.map(c => (
            <div key={c.id} className={`p-3 rounded-lg text-sm ${c.authorType === 'contact' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">{c.authorType === 'contact' ? 'You' : 'Support'}</Badge>
                <span className="text-xs text-muted-foreground">{fmtTime(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t">
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Add a comment..."
              className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }} />
            <Button size="sm" onClick={sendComment} disabled={sending || !body.trim()} className="self-end">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewTicket({ onBack }: { onBack: () => void }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Category[]>('/portal/ticket-categories').then(setCategories).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload: Record<string, string> = { subject, description };
      if (categoryId) payload.categoryId = categoryId;
      if (subcategoryId) payload.subcategoryId = subcategoryId;
      await api('/portal/tickets', { method: 'POST', body: JSON.stringify(payload) });
      onBack();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally { setSaving(false); }
  }

  const selectedCat = categories.find(c => c.id === categoryId);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
      <Card>
        <CardHeader><CardTitle>New Support Request</CardTitle></CardHeader>
        <CardContent>
          {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input required value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of your issue" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubcategoryId(''); }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <select value={subcategoryId} onChange={e => setSubcategoryId(e.target.value)} disabled={!categoryId}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{categoryId ? 'Select subcategory' : 'Select category first'}</option>
                  {selectedCat?.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="Describe the issue in detail..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit Ticket'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== INVOICES TAB =====

function InvoicesTab() {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<InvoiceData[]>('/portal/invoices').then(d => { setInvoices(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" description="Your invoices will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">#</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Issued</th>
                <th className="text-left p-3 font-medium">Due</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-right p-3 font-medium">Paid</th>
                <th className="text-right p-3 font-medium">Balance</th>
              </tr></thead>
              <tbody>
                {invoices.map(inv => {
                  const balance = inv.totalCents - inv.amountPaidCents;
                  return (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">INV-{inv.invoiceNumber}</td>
                      <td className="p-3"><Badge className={`text-xs ${statusStyle[inv.status] ?? ''}`}>{inv.status}</Badge></td>
                      <td className="p-3">{fmtDate(inv.issueDate)}</td>
                      <td className="p-3">{fmtDate(inv.dueDate)}</td>
                      <td className="p-3 text-right font-mono">{formatCents(inv.totalCents)}</td>
                      <td className="p-3 text-right font-mono">{formatCents(inv.amountPaidCents)}</td>
                      <td className="p-3 text-right font-mono font-medium">{balance > 0 ? formatCents(balance) : <span className="text-green-600">Paid</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== QUOTES TAB =====

function QuotesTab() {
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api<QuoteData[]>('/portal/quotes').then(d => { setQuotes(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    await api(`/portal/quotes/${id}/approve`, { method: 'POST' });
    load();
  }
  async function reject(id: string) {
    await api(`/portal/quotes/${id}/reject`, { method: 'POST' });
    load();
  }

  if (!loaded) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Quotes</CardTitle></CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <EmptyState icon={FileText} title="No quotes" description="Quotes for proposed work will appear here." />
        ) : (
          <div className="space-y-2">
            {quotes.map(q => (
              <div key={q.id} className="p-3 rounded-lg border">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">Q-{q.quoteNumber}</span>
                      <Badge className={`text-xs ${statusStyle[q.status] ?? ''}`}>{q.status}</Badge>
                    </div>
                    <div className="font-medium">{q.title}</div>
                    <div className="text-sm text-muted-foreground">{formatCents(q.totalCents)} - {fmtDate(q.createdAt)}</div>
                  </div>
                  {q.status === 'sent' && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => reject(q.id)}><X className="h-4 w-4 mr-1" />Decline</Button>
                      <Button size="sm" onClick={() => approve(q.id)}><Check className="h-4 w-4 mr-1" />Approve</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== ASSETS TAB =====

function AssetsTab() {
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<AssetData[]>('/portal/assets').then(d => { setAssets(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <EmptyState icon={Monitor} title="No assets" description="Managed devices and hardware will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Serial</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3 capitalize">{a.type}</td>
                    <td className="p-3 font-mono text-xs">{a.serialNumber ?? '-'}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs capitalize">{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== ADMIN TAB =====

function AdminTab() {
  const [users, setUsers] = useState<PortalUserData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showInvite, setShowInvite] = useState<string | null>(null); // contactId to invite
  const [invitePassword, setInvitePassword] = useState('');
  const [invitePerms, setInvitePerms] = useState<string[]>(['tickets']);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    api<PortalUserData[]>('/portal/users').then(d => { setUsers(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function enableUser() {
    if (!showInvite || !invitePassword) return;
    setSaving(true); setMessage('');
    try {
      await api(`/portal/users/${showInvite}/enable`, {
        method: 'POST', body: JSON.stringify({ password: invitePassword, permissions: invitePerms }),
      });
      setShowInvite(null); setInvitePassword(''); setInvitePerms(['tickets']);
      setMessage('Portal access granted');
      load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally { setSaving(false); }
  }

  async function updatePerms(contactId: string, permissions: string[]) {
    await api(`/portal/users/${contactId}`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
    load();
  }

  async function revoke(contactId: string) {
    if (!confirm('Revoke this user\'s portal access?')) return;
    await api(`/portal/users/${contactId}/revoke`, { method: 'POST' });
    load();
  }

  if (!loaded) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  const activeUsers = users.filter(u => u.portalEnabled);
  const inactiveUsers = users.filter(u => !u.portalEnabled);

  return (
    <div className="space-y-4">
      {message && <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md border border-green-200">{message}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Active Portal Users</CardTitle></CardHeader>
        <CardContent>
          {activeUsers.length === 0 ? <p className="text-sm text-muted-foreground">No active portal users</p> : (
            <div className="space-y-2">
              {activeUsers.map(u => {
                const perms = (u.portalPermissions ?? ['tickets']) as string[];
                return (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium">{u.firstName} {u.lastName}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                      <div className="flex gap-1 mt-1">
                        {u.portalRole === 'admin' && <Badge className="text-xs bg-purple-100 text-purple-800">Admin</Badge>}
                        {perms.includes('tickets') && <Badge variant="outline" className="text-xs">Tickets</Badge>}
                        {perms.includes('billing') && <Badge variant="outline" className="text-xs">Billing</Badge>}
                      </div>
                    </div>
                    {u.portalRole !== 'admin' && (
                      <div className="flex gap-2 shrink-0">
                        <select value={perms.join(',')} onChange={e => updatePerms(u.id, e.target.value.split(','))}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="tickets">Tickets only</option>
                          <option value="billing">Billing only</option>
                          <option value="tickets,billing">Tickets + Billing</option>
                        </select>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revoke(u.id)}>Revoke</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {inactiveUsers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Available Contacts</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">These contacts don't have portal access yet. Click "Grant Access" to set them up.</p>
            <div className="space-y-2">
              {inactiveUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium">{u.firstName} {u.lastName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setShowInvite(u.id); setInvitePassword(''); setInvitePerms(['tickets']); }}>
                    Grant Access
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite dialog - inline */}
      {showInvite && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Grant Portal Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set a temporary password for <strong>{users.find(u => u.id === showInvite)?.email}</strong>
            </p>
            <div className="space-y-2">
              <Label>Password (minimum 8 characters)</Label>
              <Input type="password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Temporary password" />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={invitePerms.includes('tickets')}
                    onChange={e => setInvitePerms(p => e.target.checked ? [...p, 'tickets'] : p.filter(x => x !== 'tickets'))} />
                  Tickets
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={invitePerms.includes('billing')}
                    onChange={e => setInvitePerms(p => e.target.checked ? [...p, 'billing'] : p.filter(x => x !== 'billing'))} />
                  Billing
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInvite(null)}>Cancel</Button>
              <Button onClick={enableUser} disabled={saving || invitePassword.length < 12}>
                {saving ? 'Saving...' : 'Grant Access'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ===== Shared =====

function EmptyState({ icon: Icon, title, description }: { icon: typeof Ticket; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ===== Settings Tab =====

interface ProfileData {
  id: string; firstName: string; lastName: string; email: string;
  phone: string | null; jobTitle: string | null;
}
interface PasskeyData {
  id: string; deviceType: string | null; backedUp: boolean; createdAt: string;
}
interface BillingData {
  name: string; billingEmail: string | null; ccBillingEmail: string | null;
  phone: string | null; address: string | null; city: string | null;
  state: string | null; zip: string | null; creditBalanceCents: number;
}

function SettingsTab({ isAdmin }: { isAdmin: boolean }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', jobTitle: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Password
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyData[]>([]);
  const [passkeyMsg, setPasskeyMsg] = useState('');
  const [registering, setRegistering] = useState(false);

  // Billing (admin)
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingForm, setBillingForm] = useState({ billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '' });
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingMsg, setBillingMsg] = useState('');

  useEffect(() => {
    api<ProfileData>('/portal/me').then(p => {
      setProfile(p);
      setProfileForm({
        firstName: p.firstName || '', lastName: p.lastName || '',
        phone: p.phone || '', jobTitle: p.jobTitle || '',
      });
    }).catch(() => {});

    loadPasskeys();

    if (isAdmin) {
      api<BillingData>('/portal/billing').then(b => {
        setBilling(b);
        setBillingForm({
          billingEmail: b.billingEmail || '', ccBillingEmail: b.ccBillingEmail || '',
          phone: b.phone || '', address: b.address || '',
          city: b.city || '', state: b.state || '', zip: b.zip || '',
        });
      }).catch(() => {});
    }
  }, [isAdmin]);

  async function loadPasskeys() {
    try {
      const keys = await api<PasskeyData[]>('/portal/me/passkeys');
      setPasskeys(keys);
    } catch { /* ignore */ }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setSavingProfile(true); setProfileMsg('');
    try {
      await api('/portal/me', { method: 'PATCH', body: JSON.stringify(profileForm) });
      setProfileMsg('Profile updated');
      const p = await api<ProfileData>('/portal/me');
      setProfile(p);
    } catch (err: any) { setProfileMsg(err.message || 'Failed to update'); }
    finally { setSavingProfile(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault(); setSavingPw(true); setPwMsg('');
    if (pwForm.next !== pwForm.confirm) { setPwMsg('Passwords do not match'); setSavingPw(false); return; }
    if (pwForm.next.length < 15) { setPwMsg('Password must be at least 15 characters'); setSavingPw(false); return; }
    try {
      await api('/portal/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      setPwMsg('Password changed successfully');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) { setPwMsg(err.message || 'Failed to change password'); }
    finally { setSavingPw(false); }
  }

  async function registerPasskey() {
    setRegistering(true); setPasskeyMsg('');
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await api<any>('/portal/auth/passkey/register-options', { method: 'POST', body: JSON.stringify({}) });
      const attResp = await startRegistration({ optionsJSON: options });
      await api('/portal/auth/passkey/register', { method: 'POST', body: JSON.stringify(attResp) });
      setPasskeyMsg('Passkey registered successfully');
      await loadPasskeys();
    } catch (err: any) {
      setPasskeyMsg(err.message || 'Failed to register passkey');
    } finally { setRegistering(false); }
  }

  async function deletePasskey(id: string) {
    if (!confirm('Delete this passkey? You won\'t be able to use it to sign in anymore.')) return;
    try {
      await api(`/portal/me/passkeys/${id}`, { method: 'DELETE' });
      await loadPasskeys();
    } catch (err: any) { setPasskeyMsg(err.message || 'Failed to delete passkey'); }
  }

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault(); setSavingBilling(true); setBillingMsg('');
    try {
      await api('/portal/billing', { method: 'PATCH', body: JSON.stringify(billingForm) });
      setBillingMsg('Billing info updated');
      const b = await api<BillingData>('/portal/billing');
      setBilling(b);
    } catch (err: any) { setBillingMsg(err.message || 'Failed to update billing'); }
    finally { setSavingBilling(false); }
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />My Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {profileMsg && <div className="mb-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{profileMsg}</div>}
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>First Name</Label><Input value={profileForm.firstName} onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Last Name</Label><Input value={profileForm.lastName} onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Email</Label><Input value={profile?.email || ''} disabled /><p className="text-xs text-muted-foreground">Contact your account manager to change your email address.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Phone</Label><Input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" /></div>
              <div className="space-y-1"><Label>Job Title</Label><Input value={profileForm.jobTitle} onChange={e => setProfileForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="IT Manager" /></div>
            </div>
            <Button type="submit" disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save Profile'}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          {pwMsg && <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${pwMsg.includes('success') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{pwMsg}</div>}
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-1"><Label>Current Password</Label><Input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required /></div>
            <div className="space-y-1"><Label>New Password</Label><Input type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required minLength={15} /><p className="text-xs text-muted-foreground">At least 15 characters.</p></div>
            <div className="space-y-1"><Label>Confirm New Password</Label><Input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required /></div>
            <Button type="submit" disabled={savingPw}>{savingPw ? 'Saving...' : 'Change Password'}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Passkeys</CardTitle>
            <Button size="sm" onClick={registerPasskey} disabled={registering}>
              <Plus className="h-4 w-4 mr-1" />{registering ? 'Adding...' : 'Add Passkey'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Passkeys let you sign in with your fingerprint, face, or security key — no password needed.</p>
        </CardHeader>
        <CardContent>
          {passkeyMsg && <div className="mb-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">{passkeyMsg}</div>}
          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No passkeys yet. Add one to sign in without a password.</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map(pk => (
                <div key={pk.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{pk.deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device Passkey'}</div>
                      <div className="text-xs text-muted-foreground">Added {fmtDate(pk.createdAt)}{pk.backedUp ? ' • Backed up' : ''}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deletePasskey(pk.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Company Billing Information</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">Billing details for {billing?.name}. This is where invoices will be sent.</p>
          </CardHeader>
          <CardContent>
            {billingMsg && <div className="mb-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{billingMsg}</div>}
            <form onSubmit={saveBilling} className="space-y-4">
              <div className="space-y-1"><Label>Billing Email</Label><Input type="email" value={billingForm.billingEmail} onChange={e => setBillingForm(f => ({ ...f, billingEmail: e.target.value }))} placeholder="billing@company.com" /></div>
              <div className="space-y-1"><Label>CC Billing Email</Label><Input type="email" value={billingForm.ccBillingEmail} onChange={e => setBillingForm(f => ({ ...f, ccBillingEmail: e.target.value }))} placeholder="accounting@company.com (optional)" /></div>
              <div className="space-y-1"><Label>Billing Phone</Label><Input value={billingForm.phone} onChange={e => setBillingForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" /></div>
              <div className="space-y-1"><Label>Address</Label><Input value={billingForm.address} onChange={e => setBillingForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1"><Label>City</Label><Input value={billingForm.city} onChange={e => setBillingForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="space-y-1"><Label>State</Label><Input value={billingForm.state} onChange={e => setBillingForm(f => ({ ...f, state: e.target.value }))} /></div>
                <div className="space-y-1"><Label>ZIP</Label><Input value={billingForm.zip} onChange={e => setBillingForm(f => ({ ...f, zip: e.target.value }))} /></div>
              </div>
              {billing && billing.creditBalanceCents > 0 && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm">
                  <span className="font-medium text-green-800">Account Credit:</span> <span className="text-green-800">{formatCents(billing.creditBalanceCents)}</span>
                </div>
              )}
              <Button type="submit" disabled={savingBilling}>{savingBilling ? 'Saving...' : 'Save Billing Info'}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
