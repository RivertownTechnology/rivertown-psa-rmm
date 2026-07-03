import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, SkeletonList, SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BrandLockup } from '@/components/ui/brand-lockup';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TICKET_STATUS_COLORS, TICKET_STATUS_LABELS,
  INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS,
  QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS,
  ASSET_STATUS_COLORS, statusBadgeClass, formatStatus,
} from '@/lib/badge-colors';
import {
  LogOut, Ticket, FileText, Receipt, Monitor, Plus, User,
  MessageSquare, ChevronLeft, Send, Users, Shield, ShieldCheck, Check, X,
  Settings as SettingsIcon, KeyRound, Fingerprint, Trash2, CreditCard, AlertCircle,
  Inbox, Wallet,
} from 'lucide-react';

// ===== Types =====

interface TicketData {
  id: string; ticketNumber: number; subject: string; description: string | null;
  status: string; priority: string; createdAt: string; updatedAt: string;
}
interface Comment { id: string; authorType: string; authorName?: string | null; body: string; createdAt: string; }
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

// Status badges use the shared admin color/label tokens (badge-colors.ts) so the
// portal and the admin app render every status identically.
function TicketStatusBadge({ status }: { status: string }) {
  return <Badge variant="status" className={cn('text-xs', statusBadgeClass(TICKET_STATUS_COLORS, status))}>{formatStatus(status, TICKET_STATUS_LABELS)}</Badge>;
}
function InvoiceStatusBadge({ status }: { status: string }) {
  return <Badge variant="status" className={cn('text-xs', statusBadgeClass(INVOICE_STATUS_COLORS, status))}>{formatStatus(status, INVOICE_STATUS_LABELS)}</Badge>;
}
function QuoteStatusBadge({ status }: { status: string }) {
  return <Badge variant="status" className={cn('text-xs', statusBadgeClass(QUOTE_STATUS_COLORS, status))}>{formatStatus(status, QUOTE_STATUS_LABELS)}</Badge>;
}
function AssetStatusBadge({ status }: { status: string }) {
  return <Badge variant="status" className={cn('text-xs capitalize', statusBadgeClass(ASSET_STATUS_COLORS, status))}>{formatStatus(status)}</Badge>;
}

function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtTime(d: string) { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function CommentAvatar({ name, isYou }: { name: string; isYou: boolean }) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        isYou ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/15 text-foreground',
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

// ===== Main Component =====

interface DashboardProps {
  userName: string; portalRole: string; portalPermissions: string[]; onLogout: () => void;
}

export function Dashboard({ userName, portalRole, portalPermissions, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('tickets');
  const [stats, setStats] = useState<Stats | null>(null);
  const [composeTicket, setComposeTicket] = useState(false);
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
          <BrandLockup size="md" />
          <div className="flex items-center gap-2 sm:gap-3">
            {userName && (
              <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                <User className="h-3.5 w-3.5" />
                {userName}
                {isAdmin && <Badge variant="outline" className="text-xs ml-1">Admin</Badge>}
              </span>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Welcome'}
            </h1>
            <p className="text-muted-foreground">Manage your support requests, invoices, and account.</p>
          </div>
          {hasTickets && (
            <Button
              onClick={() => { setActiveTab('tickets'); setComposeTicket(true); }}
              className="shadow-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />New Ticket
            </Button>
          )}
        </div>

        {/* Quick stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {hasTickets && <QuickStat label="Open Tickets" icon={Ticket} loading={!stats} value={String(stats?.tickets.open ?? 0)} onClick={() => setActiveTab('tickets')} />}
          {hasTickets && <QuickStat label="Total Tickets" icon={Inbox} loading={!stats} value={String(stats?.tickets.total ?? 0)} onClick={() => setActiveTab('tickets')} />}
          {hasBilling && <QuickStat label="Unpaid Invoices" icon={Receipt} loading={!stats} value={String(stats?.invoices.outstanding ?? 0)} onClick={() => setActiveTab('invoices')} />}
          {hasBilling && <QuickStat label="Outstanding" icon={Wallet} loading={!stats} value={stats ? formatCents(stats.invoices.outstandingCents) : ''} tone={stats && stats.invoices.outstandingCents > 0 ? 'warning' : 'default'} onClick={() => setActiveTab('invoices')} />}
        </div>

        {/* Tabs — icon+label pill row on desktop */}
        <div className="mb-4 hidden gap-1 overflow-x-auto rounded-lg bg-secondary p-1 sm:flex">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'tickets' && hasTickets && <TicketsTab compose={composeTicket} onComposeConsumed={() => setComposeTicket(false)} />}
        {activeTab === 'invoices' && hasBilling && <InvoicesTab />}
        {activeTab === 'quotes' && hasBilling && <QuotesTab />}
        {activeTab === 'assets' && <AssetsTab />}
        {activeTab === 'admin' && isAdmin && <AdminTab />}
        {activeTab === 'settings' && <SettingsTab isAdmin={isAdmin} />}
      </main>

      {/* Mobile bottom tab bar — icon stacked over a small label */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-background/95 backdrop-blur sm:hidden">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function QuickStat({
  label, value, icon: Icon, onClick, loading, tone = 'default',
}: {
  label: string;
  value: string;
  icon: typeof Ticket;
  onClick?: () => void;
  loading?: boolean;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        onClick && 'cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/30',
      )}
    >
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground/70" />
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className={cn(
            'text-2xl font-bold tabular-nums',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          )}>
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ===== TICKETS TAB =====

function TicketsTab({ compose, onComposeConsumed }: { compose?: boolean; onComposeConsumed?: () => void }) {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api<TicketData[]>('/portal/tickets').then(d => { setTickets(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Respond to the "New Ticket" button lifted to the page header.
  useEffect(() => {
    if (compose) { setSelected(null); setShowNew(true); onComposeConsumed?.(); }
  }, [compose, onComposeConsumed]);

  if (selected) return <TicketDetail ticketId={selected} onBack={() => { setSelected(null); load(); }} />;
  if (showNew) return <NewTicket onBack={() => { setShowNew(false); load(); }} />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Tickets</CardTitle>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />New Ticket</Button>
      </CardHeader>
      <CardContent>
        {!loaded ? <SkeletonList rows={4} /> :
         tickets.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            description="Submit a support request and it will appear here."
            action={{ label: 'New Ticket', onClick: () => setShowNew(true) }}
          />
        ) : (
          <div className="space-y-2">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">#{t.ticketNumber}</span>
                      <TicketStatusBadge status={t.status} />
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
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true); setLoadError(false);
    Promise.all([
      api<TicketData>(`/portal/tickets/${ticketId}`),
      api<Comment[]>(`/portal/tickets/${ticketId}/comments`),
    ])
      .then(([t, c]) => { setTicket(t); setComments(c); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

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

  if (loadError || (!loading && !ticket)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back to Tickets</Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Couldn't load this ticket</h3>
              <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
            </div>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !ticket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back to Tickets</Button>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-3 w-32" />
          </CardHeader>
        </Card>
        <Card>
          <CardContent className="pt-6"><SkeletonList rows={3} /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back to Tickets</Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
            <TicketStatusBadge status={ticket.status} />
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
          {comments.map(c => {
            const isYou = c.authorType === 'contact';
            const name = isYou ? 'You' : (c.authorName?.trim() || 'Support');
            return (
              <div key={c.id} className={`flex gap-2 ${isYou ? 'flex-row-reverse ml-6' : 'mr-6'}`}>
                <CommentAvatar name={name} isYou={isYou} />
                <div className={`min-w-0 flex-1 rounded-lg p-3 text-sm ${isYou ? 'bg-primary/10' : 'bg-muted'}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">{fmtTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            );
          })}
          <div className="border-t pt-3">
            <div className="flex gap-2">
              <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Add a comment..."
                className="flex-1 resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }} />
              <Button size="sm" onClick={sendComment} disabled={sending || !body.trim()} className="self-end" aria-label="Send comment">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Press Enter to send · Shift+Enter for a new line</p>
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
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input id="ticket-subject" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of your issue" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ticket-category">Category</Label>
                <Select value={categoryId} onValueChange={v => { setCategoryId(v); setSubcategoryId(''); }}>
                  <SelectTrigger id="ticket-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-subcategory">Subcategory</Label>
                <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={!categoryId}>
                  <SelectTrigger id="ticket-subcategory">
                    <SelectValue placeholder={categoryId ? 'Select subcategory' : 'Select category first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCat?.subcategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-description">Description</Label>
              <Textarea id="ticket-description" value={description} onChange={e => setDescription(e.target.value)}
                className="min-h-[120px] resize-none"
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
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<InvoiceData[]>('/portal/invoices').then(d => { setInvoices(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  if (selected) return <InvoiceDetail invoiceId={selected} onBack={() => setSelected(null)} />;

  if (!loaded) return (
    <Card>
      <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
      <CardContent><SkeletonTable rows={5} columns={5} /></CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" description="Your invoices will appear here." />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="space-y-2 sm:hidden">
              {invoices.map(inv => {
                const balance = inv.totalCents - inv.amountPaidCents;
                const overdue = inv.status === 'overdue';
                return (
                  <button key={inv.id} onClick={() => setSelected(inv.id)}
                    className={cn('w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50', overdue && 'bg-red-500/5 border-red-500/30')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">INV-{inv.invoiceNumber}</span>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Due {fmtDate(inv.dueDate)}</span>
                      <span className="text-lg font-semibold tabular-nums">
                        {balance > 0 ? formatCents(balance) : <span className="text-emerald-600 dark:text-emerald-400 text-base">Paid</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">#</th>
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="hidden p-3 text-left font-medium lg:table-cell">Issued</th>
                  <th className="p-3 text-left font-medium">Due</th>
                  <th className="p-3 text-right font-medium">Total</th>
                  <th className="hidden p-3 text-right font-medium lg:table-cell">Paid</th>
                  <th className="p-3 text-right font-medium">Balance</th>
                </tr></thead>
                <tbody>
                  {invoices.map(inv => {
                    const balance = inv.totalCents - inv.amountPaidCents;
                    const overdue = inv.status === 'overdue';
                    return (
                      <tr key={inv.id} onClick={() => setSelected(inv.id)}
                        className={cn('cursor-pointer border-b hover:bg-muted/40', overdue && 'bg-red-500/5')}>
                        <td className="p-3 font-medium">INV-{inv.invoiceNumber}</td>
                        <td className="p-3"><InvoiceStatusBadge status={inv.status} /></td>
                        <td className="hidden p-3 lg:table-cell">{fmtDate(inv.issueDate)}</td>
                        <td className="p-3">{fmtDate(inv.dueDate)}</td>
                        <td className="p-3 text-right tabular-nums">{formatCents(inv.totalCents)}</td>
                        <td className="hidden p-3 text-right tabular-nums lg:table-cell">{formatCents(inv.amountPaidCents)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {balance > 0 ? formatCents(balance) : <span className="text-emerald-600 dark:text-emerald-400">Paid</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceDetail({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api<InvoiceData>(`/portal/invoices/${invoiceId}`)
      .then(setInvoice)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const backBtn = (
    <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Back to Invoices</Button>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {backBtn}
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Couldn't load this invoice</h3>
              <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
            </div>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !invoice) {
    return (
      <div className="space-y-4">
        {backBtn}
        <Card><CardContent className="space-y-3 pt-6"><SkeletonList rows={3} /></CardContent></Card>
      </div>
    );
  }

  const balance = invoice.totalCents - invoice.amountPaidCents;

  return (
    <div className="space-y-4">
      {backBtn}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>INV-{invoice.invoiceNumber}</CardTitle>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Issued {fmtDate(invoice.issueDate)} · Due {fmtDate(invoice.dueDate)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balance due — the loudest element */}
          <div className={cn('rounded-lg border p-4', balance > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20')}>
            <p className="text-sm text-muted-foreground">Balance Due</p>
            <p className={cn('text-3xl font-bold tabular-nums', balance > 0 ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
              {balance > 0 ? formatCents(balance) : 'Paid in full'}
            </p>
          </div>

          <dl className="divide-y text-sm">
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatCents(invoice.subtotalCents)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatCents(invoice.taxCents)}</dd></div>
            <div className="flex justify-between py-2"><dt className="font-medium">Total</dt><dd className="font-medium tabular-nums">{formatCents(invoice.totalCents)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Amount Paid</dt><dd className="tabular-nums">{formatCents(invoice.amountPaidCents)}</dd></div>
          </dl>

          <p className="text-xs text-muted-foreground">
            To pay this invoice or ask a billing question, reply to your invoice email or contact your account manager.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== QUOTES TAB =====

function QuotesTab() {
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<{ quote: QuoteData; action: 'approve' | 'reject' } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<QuoteData[]>('/portal/quotes').then(d => { setQuotes(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmAction() {
    if (!pending || submitting) return;
    setSubmitting(true); setError('');
    try {
      const endpoint = pending.action === 'approve' ? 'approve' : 'reject';
      await api(`/portal/quotes/${pending.quote.id}/${endpoint}`, { method: 'POST' });
      setPending(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${pending.action} quote. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return (
    <Card>
      <CardHeader><CardTitle>Quotes</CardTitle></CardHeader>
      <CardContent><SkeletonList rows={3} /></CardContent>
    </Card>
  );

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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">Q-{q.quoteNumber}</span>
                      <QuoteStatusBadge status={q.status} />
                    </div>
                    <div className="font-medium">{q.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(q.createdAt)}</div>
                  </div>
                  <div className="shrink-0 text-right text-lg font-semibold tabular-nums">
                    {formatCents(q.totalCents)}
                  </div>
                </div>
                {q.status === 'sent' && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setError(''); setPending({ quote: q, action: 'reject' }); }}><X className="h-4 w-4 mr-1" />Decline</Button>
                    <Button size="sm" onClick={() => { setError(''); setPending({ quote: q, action: 'approve' }); }}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => { if (!o && !submitting) { setPending(null); setError(''); } }}
        title={pending?.action === 'approve' ? 'Approve this quote?' : 'Decline this quote?'}
        description={
          pending
            ? pending.action === 'approve'
              ? `Approving Q-${pending.quote.quoteNumber} "${pending.quote.title}" for ${formatCents(pending.quote.totalCents)} authorizes the work and is a financial commitment. Continue?`
              : `Decline Q-${pending.quote.quoteNumber} "${pending.quote.title}"? Your account manager will be notified.`
            : ''
        }
        confirmLabel={pending?.action === 'approve' ? 'Approve Quote' : 'Decline Quote'}
        variant={pending?.action === 'approve' ? 'default' : 'destructive'}
        onConfirm={confirmAction}
        loading={submitting}
        error={error}
      />
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

  if (!loaded) return (
    <Card>
      <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
      <CardContent><SkeletonTable rows={5} columns={4} /></CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <EmptyState icon={Monitor} title="No assets" description="Managed devices and hardware will appear here." />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="space-y-2 sm:hidden">
              {assets.map(a => (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">{a.type}</div>
                    </div>
                    <AssetStatusBadge status={a.status} />
                  </div>
                  {a.serialNumber && <div className="mt-2 font-mono text-xs text-muted-foreground">SN: {a.serialNumber}</div>}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Name</th>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="hidden p-3 text-left font-medium md:table-cell">Serial</th>
                  <th className="p-3 text-left font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{a.name}</td>
                      <td className="p-3 capitalize">{a.type}</td>
                      <td className="hidden p-3 font-mono text-xs md:table-cell">{a.serialNumber ?? '-'}</td>
                      <td className="p-3"><AssetStatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<PortalUserData | null>(null);
  const [revoking, setRevoking] = useState(false);

  const MIN_PASSWORD_LENGTH = 12;
  const passwordTooShort = invitePassword.length > 0 && invitePassword.length < MIN_PASSWORD_LENGTH;

  const load = useCallback(() => {
    api<PortalUserData[]>('/portal/users').then(d => { setUsers(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function enableUser() {
    if (!showInvite) return;
    if (invitePassword.length < MIN_PASSWORD_LENGTH) {
      setInviteError(`Must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setSaving(true); setInviteError(''); setMessage(null);
    try {
      await api(`/portal/users/${showInvite}/enable`, {
        method: 'POST', body: JSON.stringify({ password: invitePassword, permissions: invitePerms }),
      });
      setShowInvite(null); setInvitePassword(''); setInvitePerms(['tickets']);
      setMessage({ type: 'success', text: 'Portal access granted' });
      load();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Failed to grant access');
    } finally { setSaving(false); }
  }

  async function updatePerms(contactId: string, permissions: string[]) {
    await api(`/portal/users/${contactId}`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
    load();
  }

  async function confirmRevoke() {
    if (!revokeTarget || revoking) return;
    setRevoking(true); setMessage(null);
    try {
      await api(`/portal/users/${revokeTarget.id}/revoke`, { method: 'POST' });
      setRevokeTarget(null);
      setMessage({ type: 'success', text: 'Portal access revoked' });
      load();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to revoke access' });
      setRevokeTarget(null);
    } finally { setRevoking(false); }
  }

  if (!loaded) return <SkeletonList rows={4} />;

  const activeUsers = users.filter(u => u.portalEnabled);
  const inactiveUsers = users.filter(u => !u.portalEnabled);

  return (
    <div className="space-y-4">
      {message && (
        <div className={`text-sm p-3 rounded-md border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900' : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900'}`}>
          {message.text}
        </div>
      )}

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
                        {u.portalRole === 'admin' && <Badge variant="status" className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">Admin</Badge>}
                        {perms.includes('tickets') && <Badge variant="outline" className="text-xs">Tickets</Badge>}
                        {perms.includes('billing') && <Badge variant="outline" className="text-xs">Billing</Badge>}
                      </div>
                    </div>
                    {u.portalRole !== 'admin' && (
                      <div className="flex gap-2 shrink-0">
                        <Select value={perms.join(',')} onValueChange={v => updatePerms(u.id, v.split(','))}>
                          <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tickets">Tickets only</SelectItem>
                            <SelectItem value="billing">Billing only</SelectItem>
                            <SelectItem value="tickets,billing">Tickets + Billing</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRevokeTarget(u)}>Revoke</Button>
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
                  <Button size="sm" variant="outline" onClick={() => { setShowInvite(u.id); setInvitePassword(''); setInvitePerms(['tickets']); setInviteError(''); }}>
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
            {inviteError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{inviteError}</div>}
            <div className="space-y-2">
              <Label htmlFor="invite-password">Password (minimum {MIN_PASSWORD_LENGTH} characters)</Label>
              <Input id="invite-password" type="password" value={invitePassword} onChange={e => { setInvitePassword(e.target.value); setInviteError(''); }} placeholder="Temporary password" aria-invalid={passwordTooShort} />
              {passwordTooShort && <p className="text-xs text-destructive">Must be at least {MIN_PASSWORD_LENGTH} characters</p>}
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={invitePerms.includes('tickets')}
                    onCheckedChange={c => setInvitePerms(p => c === true ? [...new Set([...p, 'tickets'])] : p.filter(x => x !== 'tickets'))} />
                  Tickets
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={invitePerms.includes('billing')}
                    onCheckedChange={c => setInvitePerms(p => c === true ? [...new Set([...p, 'billing'])] : p.filter(x => x !== 'billing'))} />
                  Billing
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInvite(null)}>Cancel</Button>
              <Button onClick={enableUser} disabled={saving || invitePassword.length < MIN_PASSWORD_LENGTH}>
                {saving ? 'Saving...' : 'Grant Access'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => { if (!o && !revoking) setRevokeTarget(null); }}
        title="Revoke portal access?"
        description={revokeTarget ? `${revokeTarget.firstName} ${revokeTarget.lastName} (${revokeTarget.email}) will no longer be able to sign in to the portal.` : ''}
        confirmLabel="Revoke Access"
        variant="destructive"
        onConfirm={confirmRevoke}
        loading={revoking}
      />
    </div>
  );
}

// ===== Shared =====

function EmptyState({ icon: Icon, title, description, action }: {
  icon: typeof Ticket;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button size="sm" className="mt-6" onClick={action.onClick}>
          <Plus className="h-4 w-4 mr-1" />{action.label}
        </Button>
      )}
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

type Msg = { type: 'success' | 'error'; text: string } | null;

function MessageBanner({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const isError = msg.type === 'error';
  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${isError
      ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-900 dark:text-red-300'
      : 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-900 dark:text-green-300'}`}>
      {msg.text}
    </div>
  );
}

function SettingsTab({ isAdmin }: { isAdmin: boolean }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', jobTitle: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  // Password
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyData[]>([]);
  const [passkeyMsg, setPasskeyMsg] = useState<Msg>(null);
  const [registering, setRegistering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PasskeyData | null>(null);
  const [deletingPasskey, setDeletingPasskey] = useState(false);

  // Billing (admin)
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingForm, setBillingForm] = useState({ billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '' });
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingMsg, setBillingMsg] = useState<Msg>(null);

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
    e.preventDefault(); setSavingProfile(true); setProfileMsg(null);
    try {
      await api('/portal/me', { method: 'PATCH', body: JSON.stringify(profileForm) });
      setProfileMsg({ type: 'success', text: 'Profile updated' });
      const p = await api<ProfileData>('/portal/me');
      setProfile(p);
    } catch (err: any) { setProfileMsg({ type: 'error', text: err.message || 'Failed to update' }); }
    finally { setSavingProfile(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault(); setSavingPw(true); setPwMsg(null);
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'Passwords do not match' }); setSavingPw(false); return; }
    if (pwForm.next.length < 15) { setPwMsg({ type: 'error', text: 'Password must be at least 15 characters' }); setSavingPw(false); return; }
    try {
      await api('/portal/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      setPwMsg({ type: 'success', text: 'Password changed successfully' });
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) { setPwMsg({ type: 'error', text: err.message || 'Failed to change password' }); }
    finally { setSavingPw(false); }
  }

  async function registerPasskey() {
    setRegistering(true); setPasskeyMsg(null);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await api<any>('/portal/auth/passkey/register-options', { method: 'POST', body: JSON.stringify({}) });
      const attResp = await startRegistration({ optionsJSON: options });
      await api('/portal/auth/passkey/register', { method: 'POST', body: JSON.stringify(attResp) });
      setPasskeyMsg({ type: 'success', text: 'Passkey registered successfully' });
      await loadPasskeys();
    } catch (err: any) {
      setPasskeyMsg({ type: 'error', text: err.message || 'Failed to register passkey' });
    } finally { setRegistering(false); }
  }

  async function confirmDeletePasskey() {
    if (!deleteTarget || deletingPasskey) return;
    setDeletingPasskey(true); setPasskeyMsg(null);
    try {
      await api(`/portal/me/passkeys/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setPasskeyMsg({ type: 'success', text: 'Passkey deleted' });
      await loadPasskeys();
    } catch (err: any) {
      setDeleteTarget(null);
      setPasskeyMsg({ type: 'error', text: err.message || 'Failed to delete passkey' });
    } finally { setDeletingPasskey(false); }
  }

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault(); setSavingBilling(true); setBillingMsg(null);
    try {
      await api('/portal/billing', { method: 'PATCH', body: JSON.stringify(billingForm) });
      setBillingMsg({ type: 'success', text: 'Billing info updated' });
      const b = await api<BillingData>('/portal/billing');
      setBilling(b);
    } catch (err: any) { setBillingMsg({ type: 'error', text: err.message || 'Failed to update billing' }); }
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
          <MessageBanner msg={profileMsg} />
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="profile-firstName">First Name</Label><Input id="profile-firstName" value={profileForm.firstName} onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="profile-lastName">Last Name</Label><Input id="profile-lastName" value={profileForm.lastName} onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="profile-email">Email</Label><Input id="profile-email" value={profile?.email || ''} disabled /><p className="text-xs text-muted-foreground">Contact your account manager to change your email address.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="profile-phone">Phone</Label><Input id="profile-phone" value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" /></div>
              <div className="space-y-1"><Label htmlFor="profile-jobTitle">Job Title</Label><Input id="profile-jobTitle" value={profileForm.jobTitle} onChange={e => setProfileForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="IT Manager" /></div>
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
          <MessageBanner msg={pwMsg} />
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-1"><Label htmlFor="pw-current">Current Password</Label><Input id="pw-current" type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required /></div>
            <div className="space-y-1"><Label htmlFor="pw-next">New Password</Label><Input id="pw-next" type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required minLength={15} /><p className="text-xs text-muted-foreground">At least 15 characters.</p></div>
            <div className="space-y-1"><Label htmlFor="pw-confirm">Confirm New Password</Label><Input id="pw-confirm" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required /></div>
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
          <MessageBanner msg={passkeyMsg} />
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
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(pk)} aria-label="Delete passkey">
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
            <MessageBanner msg={billingMsg} />
            <form onSubmit={saveBilling} className="space-y-4">
              <div className="space-y-1"><Label htmlFor="billing-email">Billing Email</Label><Input id="billing-email" type="email" value={billingForm.billingEmail} onChange={e => setBillingForm(f => ({ ...f, billingEmail: e.target.value }))} placeholder="billing@company.com" /></div>
              <div className="space-y-1"><Label htmlFor="billing-ccEmail">CC Billing Email</Label><Input id="billing-ccEmail" type="email" value={billingForm.ccBillingEmail} onChange={e => setBillingForm(f => ({ ...f, ccBillingEmail: e.target.value }))} placeholder="accounting@company.com (optional)" /></div>
              <div className="space-y-1"><Label htmlFor="billing-phone">Billing Phone</Label><Input id="billing-phone" value={billingForm.phone} onChange={e => setBillingForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" /></div>
              <div className="space-y-1"><Label htmlFor="billing-address">Address</Label><Input id="billing-address" value={billingForm.address} onChange={e => setBillingForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1"><Label htmlFor="billing-city">City</Label><Input id="billing-city" value={billingForm.city} onChange={e => setBillingForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor="billing-state">State</Label><Input id="billing-state" value={billingForm.state} onChange={e => setBillingForm(f => ({ ...f, state: e.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor="billing-zip">ZIP</Label><Input id="billing-zip" value={billingForm.zip} onChange={e => setBillingForm(f => ({ ...f, zip: e.target.value }))} /></div>
              </div>
              {billing && billing.creditBalanceCents > 0 && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-900/30">
                  <span className="font-medium text-green-800 dark:text-green-300">Account Credit:</span> <span className="text-green-800 dark:text-green-300">{formatCents(billing.creditBalanceCents)}</span>
                </div>
              )}
              <Button type="submit" disabled={savingBilling}>{savingBilling ? 'Saving...' : 'Save Billing Info'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deletingPasskey) setDeleteTarget(null); }}
        title="Delete this passkey?"
        description="You won't be able to use it to sign in anymore. You can add a new passkey at any time."
        confirmLabel="Delete Passkey"
        variant="destructive"
        onConfirm={confirmDeletePasskey}
        loading={deletingPasskey}
      />
    </div>
  );
}
