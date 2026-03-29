import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Clock, MessageSquare, Pencil, Check, X, ChevronDown, ChevronUp,
  Eye, EyeOff, Plus, Timer, User, Users, AlertCircle, Send, Trash2,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ticket {
  id: string; ticketNumber: number; subject: string; description: string | null;
  status: string; priority: string; ticketType: string; source: string;
  customerId: string; contactId: string | null; assetId: string | null;
  contractId: string | null; assignedTo: string | null;
  slaDueAt: string | null; resolvedAt: string | null; closedAt: string | null;
  createdAt: string; updatedAt: string;
  slaResponseDueAt: string | null; slaResolutionDueAt: string | null;
  slaResponseMet: boolean | null; slaBreached: boolean | null;
  slaPolicyId: string | null;
}

interface Comment {
  id: string; authorType: string; authorId: string; body: string;
  isInternal: boolean; createdAt: string;
}

interface TimeEntry {
  id: string; userId: string; startedAt: string; endedAt: string | null;
  durationMinutes: number | null; isBillable: boolean; isBilled: boolean;
  rateCents: number | null; notes: string | null; createdAt: string;
}

interface Contract { id: string; name: string; contractType: string; }
interface Customer { id: string; name: string; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const statusStyles: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  open: 'bg-green-100 text-green-800 border-green-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  scheduled: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  waiting_on_customer: 'bg-purple-100 text-purple-800 border-purple-200',
  resolved: 'bg-gray-100 text-gray-600 border-gray-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
};

const priorityStyles: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

const priorityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'secondary', medium: 'outline', high: 'default', critical: 'destructive',
};

const authorTypeLabel: Record<string, string> = {
  user: 'Technician', contact: 'Customer', system: 'System',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketDetailPage({ ticketId, onBack, onNavigateToCustomer }: {
  ticketId: string;
  onBack: () => void;
  onNavigateToCustomer: (id: string) => void;
}) {
  // Core data
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [techs, setTechs] = useState<Array<{ id: string; displayName: string }>>([]);

  // UI state
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [showTimeForm, setShowTimeForm] = useState(false);

  // Comment form
  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Time entry form
  const [timeForm, setTimeForm] = useState({ durationMinutes: '', notes: '', isBillable: true });
  const [submittingTime, setSubmittingTime] = useState(false);

  // Time entry editing
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeForm, setEditTimeForm] = useState({ durationMinutes: '', notes: '', isBillable: true });

  // Saving states
  const [savingField, setSavingField] = useState<string | null>(null);

  const commentsEndRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadTicket = useCallback(async () => {
    const data = await api<Ticket>(`/tickets/${ticketId}`);
    setTicket(data);
    return data;
  }, [ticketId]);

  const loadComments = useCallback(async () => {
    const data = await api<Comment[]>(`/tickets/${ticketId}/comments`);
    setComments(data);
  }, [ticketId]);

  const loadTimeEntries = useCallback(async () => {
    const data = await api<TimeEntry[]>(`/tickets/${ticketId}/time-entries`);
    setTimeEntries(data);
  }, [ticketId]);

  const loadContracts = useCallback(async (customerId: string) => {
    try {
      const data = await api<{ data: Contract[] }>(`/contracts?customerId=${customerId}&status=active&limit=100`);
      setContracts(data.data);
    } catch {
      setContracts([]);
    }
  }, []);

  const loadCustomerName = useCallback(async (customerId: string) => {
    try {
      const data = await api<Customer>(`/customers/${customerId}`);
      setCustomerName(data.name);
    } catch {
      setCustomerName('Unknown');
    }
  }, []);

  // Live tick counter for SLA countdown
  const [, setTick] = useState(0);

  useEffect(() => {
    async function init() {
      const t = await loadTicket();
      loadComments();
      loadTimeEntries();
      loadCustomerName(t.customerId);
      loadContracts(t.customerId);
      api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
      // Auto-open new tickets when a tech views them
      if (t.status === 'new') {
        await api(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
        loadTicket();
      }
    }
    init();

    // Poll ticket data every 1 second for real updates (comments, status changes)
    const dataInterval = setInterval(() => {
      loadTicket();
      loadComments();
      loadTimeEntries();
    }, 1000);

    // Tick every second for live SLA countdown + "updated X ago" display
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, [loadTicket, loadComments, loadTimeEntries, loadCustomerName, loadContracts]);

  // -------------------------------------------------------------------------
  // Ticket field updates
  // -------------------------------------------------------------------------

  async function updateTicketField(field: string, value: string | null) {
    setSavingField(field);
    try {
      const updated = await api<Ticket>(`/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      setTicket(updated);
    } finally {
      setSavingField(null);
    }
  }

  async function saveSubject() {
    if (!subjectDraft.trim()) return;
    await updateTicketField('subject', subjectDraft.trim());
    setEditingSubject(false);
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async function submitCommentWith(isInternal: boolean) {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await api(`/tickets/${ticketId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody.trim(), isInternal }),
      });
      setCommentBody('');
      setCommentInternal(false);
      await loadComments();
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } finally { setSubmittingComment(false); }
  }

  // -------------------------------------------------------------------------
  // Time entries
  // -------------------------------------------------------------------------

  async function submitTimeEntry(e: React.FormEvent) {
    e.preventDefault();
    const mins = parseInt(timeForm.durationMinutes, 10);
    if (!mins || mins <= 0) return;
    setSubmittingTime(true);
    try {
      const now = new Date().toISOString();
      await api(`/tickets/${ticketId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify({
          ticketId,
          startedAt: now,
          endedAt: now,
          durationMinutes: mins,
          isBillable: timeForm.isBillable,
          rateCents: null,
          notes: timeForm.notes || null,
        }),
      });
      setTimeForm({ durationMinutes: '', notes: '', isBillable: true });
      setShowTimeForm(false);
      loadTimeEntries();
    } finally {
      setSubmittingTime(false);
    }
  }

  // -------------------------------------------------------------------------
  // Time entry edit / delete
  // -------------------------------------------------------------------------

  function openEditTime(entry: TimeEntry) {
    setEditingTimeId(entry.id);
    setEditTimeForm({
      durationMinutes: String(entry.durationMinutes ?? ''),
      notes: entry.notes ?? '',
      isBillable: entry.isBillable,
    });
  }

  async function saveTimeEdit() {
    if (!editingTimeId) return;
    await api(`/time-entries/${editingTimeId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        durationMinutes: parseInt(editTimeForm.durationMinutes, 10),
        notes: editTimeForm.notes || null,
        isBillable: editTimeForm.isBillable,
      }),
    });
    setEditingTimeId(null);
    await loadTimeEntries();
  }

  async function deleteTimeEntry(entryId: string) {
    await api(`/time-entries/${entryId}`, { method: 'DELETE' });
    await loadTimeEntries();
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const totalMinutes = timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = timeEntries.filter(e => e.isBillable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const description = ticket?.description ?? '';
  const descriptionLong = description.length > 300;

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (!ticket) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading ticket...</div>
    );
  }

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Tickets', href: '/tickets' }, { label: `Ticket #${ticket.ticketNumber}` }]} />
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <span className="text-muted-foreground text-sm font-mono">#{ticket.ticketNumber}</span>
        <Badge className={priorityStyles[ticket.priority]}>{ticket.priority}</Badge>
        <Badge className={statusStyles[ticket.status]}>{ticket.status.replace(/_/g, ' ')}</Badge>
        {isResolved && (
          <span className="text-xs text-muted-foreground italic ml-1">
            {ticket.status === 'resolved' ? 'Resolved' : 'Closed'} {ticket.resolvedAt ? relativeTime(ticket.resolvedAt) : ticket.closedAt ? relativeTime(ticket.closedAt) : ''}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4 items-start">
        {/* ================================================================ */}
        {/* LEFT COLUMN — Conversation                                       */}
        {/* ================================================================ */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Subject */}
          <Card>
            <CardContent className="p-4">
              {/* Title */}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</div>
                {editingSubject ? (
                  <div className="flex gap-2">
                    <Input value={subjectDraft} onChange={e => setSubjectDraft(e.target.value)} className="flex-1" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { saveSubject(); } if (e.key === 'Escape') { setEditingSubject(false); } }} />
                    <Button size="sm" onClick={saveSubject}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingSubject(false)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <h3 className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors" onClick={() => { setSubjectDraft(ticket.subject); setEditingSubject(true); }}>
                    {ticket.subject}
                  </h3>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1 mt-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</div>
                {editingDesc ? (
                  <div className="space-y-2">
                    <textarea rows={5} value={descDraft} onChange={e => setDescDraft(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Ticket description..." autoFocus />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        await api(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ description: descDraft }) });
                        setEditingDesc(false);
                        await loadTicket();
                      }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors" onClick={() => { setDescDraft(description); setEditingDesc(true); }}>
                    <div className={`text-sm text-muted-foreground whitespace-pre-wrap ${!descExpanded && descriptionLong ? 'max-h-20 overflow-hidden relative' : ''}`}>
                      {description || <span className="italic">Click to add a description...</span>}
                      {!descExpanded && descriptionLong && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>
                  </div>
                )}
                {!editingDesc && descriptionLong && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDescExpanded(!descExpanded)}>
                    {descExpanded ? <><ChevronUp className="h-3 w-3 mr-1" />Show less</> : <><ChevronDown className="h-3 w-3 mr-1" />Show more</>}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comments thread */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {comments.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-muted-foreground">No comments yet. Start the conversation below.</div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {comments.map((c, i) => (
                    <div key={c.id}>
                      {i > 0 && <Separator />}
                      <div className={`p-4 ${c.isInternal ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* Author type badge */}
                          {c.authorType === 'user' && (
                            <Badge variant="outline" className="text-xs gap-1 font-normal">
                              <User className="h-3 w-3" />
                              {authorTypeLabel[c.authorType]}
                            </Badge>
                          )}
                          {c.authorType === 'contact' && (
                            <Badge variant="secondary" className="text-xs gap-1 font-normal">
                              <Users className="h-3 w-3" />
                              {authorTypeLabel[c.authorType]}
                            </Badge>
                          )}
                          {c.authorType === 'system' && (
                            <Badge variant="outline" className="text-xs gap-1 font-normal text-muted-foreground">
                              <AlertCircle className="h-3 w-3" />
                              {authorTypeLabel[c.authorType]}
                            </Badge>
                          )}
                          {c.isInternal && (
                            <Badge className="text-xs bg-amber-200 text-amber-900 border-amber-300 hover:bg-amber-200">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Internal
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto" title={formatDateTime(c.createdAt)}>
                            {relativeTime(c.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{c.body}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>
              )}

              {/* New comment form */}
              <Separator />
              <div className="p-4 space-y-3">
                <textarea
                  placeholder={commentInternal ? 'Write an internal note (not visible to customer)...' : 'Write a reply to the customer...'}
                  rows={3}
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring ${
                    commentInternal
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 placeholder:text-amber-600/50 dark:placeholder:text-amber-400/50'
                      : 'border-input bg-background'
                  }`}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={submittingComment || !commentBody.trim()}
                    onClick={() => { setCommentInternal(false); submitCommentWith(false); }}
                    className="gap-1"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {submittingComment && !commentInternal ? 'Sending...' : 'Reply'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submittingComment || !commentBody.trim()}
                    onClick={() => { setCommentInternal(true); submitCommentWith(true); }}
                    className="gap-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    {submittingComment && commentInternal ? 'Saving...' : 'Internal Note'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================ */}
        {/* RIGHT COLUMN — Properties Sidebar                                */}
        {/* ================================================================ */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Properties card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                <select
                  value={ticket.status}
                  disabled={savingField === 'status'}
                  onChange={e => updateTicketField('status', e.target.value)}
                  className={`w-full h-9 rounded-md border px-3 text-sm font-medium ${statusStyles[ticket.status] ?? ''}`}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Priority</Label>
                <select
                  value={ticket.priority}
                  disabled={savingField === 'priority'}
                  onChange={e => updateTicketField('priority', e.target.value)}
                  className={`w-full h-9 rounded-md border px-3 text-sm font-medium ${priorityStyles[ticket.priority] ?? ''}`}
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assigned To</Label>
                <select
                  value={ticket.assignedTo ?? ''}
                  onChange={async (e) => {
                    await api(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ assignedTo: e.target.value || null }) });
                    loadTicket();
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </div>

              <Separator />

              {/* Customer */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Customer</Label>
                <button
                  className="text-sm text-primary hover:underline font-medium text-left w-full truncate"
                  onClick={() => onNavigateToCustomer(ticket.customerId)}
                >
                  {customerName || 'Loading...'}
                </button>
              </div>

              {/* Contract */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contract</Label>
                <select
                  value={ticket.contractId ?? ''}
                  disabled={savingField === 'contractId'}
                  onChange={e => updateTicketField('contractId', e.target.value || null)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No contract (billable)</option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.contractType.replace(/_/g, ' ')})</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {ticket.contractId ? 'Time covered under contract' : 'Time logged will be billable'}
                </p>
              </div>

              <Separator />

              {/* Source & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source</div>
                  <Badge variant="outline" className="capitalize">{ticket.source}</Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Type</div>
                  <span className="text-sm capitalize">{ticket.ticketType.replace(/_/g, ' ')}</span>
                </div>
              </div>

              {/* SLA */}
              {ticket.slaDueAt && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">SLA Due</Label>
                  <div className={`text-sm font-medium ${new Date(ticket.slaDueAt) < new Date() ? 'text-red-600' : 'text-foreground'}`}>
                    {formatDateTime(ticket.slaDueAt)}
                    {new Date(ticket.slaDueAt) < new Date() && (
                      <Badge variant="destructive" className="ml-2 text-xs">Overdue</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* SLA Details */}
              {ticket.slaResolutionDueAt && (
                <div className="space-y-2 pt-3 border-t">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SLA</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Response Due</span>
                      <span className={ticket.slaResponseMet === true ? 'text-green-600' : ticket.slaResponseMet === false ? 'text-red-600' : ticket.slaResponseDueAt && new Date(ticket.slaResponseDueAt) < new Date() ? 'text-red-600' : ''}>
                        {ticket.slaResponseMet === true ? 'Met \u2713' : ticket.slaResponseMet === false ? 'Missed \u2717' : ticket.slaResponseDueAt ? new Date(ticket.slaResponseDueAt).toLocaleString() : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution Due</span>
                      <span className={ticket.slaBreached ? 'text-red-600 font-medium' : ''}>
                        {new Date(ticket.slaResolutionDueAt).toLocaleString()}
                      </span>
                    </div>
                    {!['resolved', 'closed'].includes(ticket.status) && (() => {
                      const now = Date.now();
                      const due = new Date(ticket.slaResolutionDueAt).getTime();
                      const remaining = due - now;
                      if (remaining <= 0) return <Badge variant="destructive">SLA Breached</Badge>;
                      const hours = Math.floor(remaining / 3600000);
                      const mins = Math.floor((remaining % 3600000) / 60000);
                      const total = due - new Date(ticket.createdAt).getTime();
                      const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
                      const color = remaining < total * 0.25 ? 'bg-yellow-500' : 'bg-green-500';
                      return (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">{hours}h {mins}m remaining</div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                    {ticket.slaBreached && <Badge variant="destructive">SLA Breached</Badge>}
                  </div>
                </div>
              )}

              <Separator />

              {/* Timestamps */}
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Created</span>
                  <span title={formatDateTime(ticket.createdAt)}>{formatDateTime(ticket.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Updated</span>
                  <span title={formatDateTime(ticket.updatedAt)}>{relativeTime(ticket.updatedAt)}</span>
                </div>
                {ticket.resolvedAt && (
                  <div className="flex justify-between">
                    <span>Resolved</span>
                    <span>{formatDateTime(ticket.resolvedAt)}</span>
                  </div>
                )}
                {ticket.closedAt && (
                  <div className="flex justify-between">
                    <span>Closed</span>
                    <span>{formatDateTime(ticket.closedAt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TIME ENTRIES SECTION — Below two columns                           */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Time Entries
              {timeEntries.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({timeEntries.length} {timeEntries.length === 1 ? 'entry' : 'entries'})
                </span>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setShowTimeForm(!showTimeForm)}>
              {showTimeForm ? (
                <><X className="h-4 w-4 mr-1" />Cancel</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" />Log Time</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Time entry form */}
          {showTimeForm && (
            <form onSubmit={submitTimeEntry} className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="30"
                    value={timeForm.durationMinutes}
                    onChange={e => setTimeForm({ ...timeForm, durationMinutes: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm">Notes</Label>
                  <Input
                    placeholder="What did you work on?"
                    value={timeForm.notes}
                    onChange={e => setTimeForm({ ...timeForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={timeForm.isBillable}
                    onChange={e => setTimeForm({ ...timeForm, isBillable: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-muted-foreground">Billable</span>
                  {ticket.contractId && (
                    <span className="text-xs text-muted-foreground">(contract covers this work)</span>
                  )}
                </label>
                <Button type="submit" size="sm" disabled={submittingTime}>
                  {submittingTime ? 'Logging...' : 'Log Entry'}
                </Button>
              </div>
            </form>
          )}

          {/* Summary bar */}
          {timeEntries.length > 0 && (
            <div className="flex items-center gap-6 text-sm px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatDuration(totalMinutes)}</span>
                <span className="text-muted-foreground">total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-green-600">{formatDuration(billableMinutes)}</span>
                <span className="text-muted-foreground">billable</span>
              </div>
              {totalMinutes - billableMinutes > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-500">{formatDuration(totalMinutes - billableMinutes)}</span>
                  <span className="text-muted-foreground">non-billable</span>
                </div>
              )}
            </div>
          )}

          {/* Time entries table */}
          {timeEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-right p-3 font-medium">Duration</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-center p-3 font-medium">Billable</th>
                    <th className="text-right p-3 font-medium">Rate</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map(entry => (
                    editingTimeId === entry.id ? (
                      <tr key={entry.id} className="border-b bg-muted/30">
                        <td className="p-2" colSpan={2}>
                          <Input type="number" min="1" className="w-24 h-8" value={editTimeForm.durationMinutes}
                            onChange={e => setEditTimeForm({...editTimeForm, durationMinutes: e.target.value})} />
                        </td>
                        <td className="p-2">
                          <Input className="h-8" value={editTimeForm.notes}
                            onChange={e => setEditTimeForm({...editTimeForm, notes: e.target.value})} />
                        </td>
                        <td className="p-2 text-center">
                          <label className="flex items-center gap-1 justify-center">
                            <input type="checkbox" checked={editTimeForm.isBillable}
                              onChange={e => setEditTimeForm({...editTimeForm, isBillable: e.target.checked})} />
                            <span className="text-xs">Billable</span>
                          </label>
                        </td>
                        <td className="p-2"></td>
                        <td className="p-2">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" className="h-7" onClick={saveTimeEdit}><Check className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingTimeId(null)}><X className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={entry.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {new Date(entry.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <span className="text-xs ml-1">
                            {new Date(entry.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium whitespace-nowrap">
                          {entry.durationMinutes ? formatDuration(entry.durationMinutes) : '-'}
                        </td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">
                          {entry.notes || <span className="italic">No notes</span>}
                        </td>
                        <td className="p-3 text-center">
                          {entry.isBillable ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Billable</Badge>
                          ) : (
                            <Badge variant="secondary">Non-billable</Badge>
                          )}
                          {entry.isBilled && (
                            <Badge variant="outline" className="ml-1 text-xs">Billed</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {entry.rateCents ? formatCents(entry.rateCents) + '/hr' : '-'}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTime(entry)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteTimeEntry(entry.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          ) : !showTimeForm ? (
            <div className="text-center text-muted-foreground py-6 text-sm">
              <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
              No time logged yet. Click "Log Time" to add an entry.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
