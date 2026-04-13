import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Clock, MessageSquare, Pencil, Check, X, ChevronDown, ChevronUp,
  Eye, EyeOff, Plus, Timer, User, Users, AlertCircle, Send, Trash2, Sparkles,
  Play, Square, MessageCircle,
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
  categoryId: string | null; subcategoryId: string | null;
  slaDueAt: string | null; resolvedAt: string | null; closedAt: string | null;
  createdAt: string; updatedAt: string;
  slaResponseDueAt: string | null; slaResolutionDueAt: string | null;
  slaResponseMet: boolean | null; slaBreached: boolean | null;
  slaPolicyId: string | null;
}

interface TicketCategory {
  id: string; name: string; sortOrder: number;
  subcategories: Array<{ id: string; name: string; sortOrder: number }>;
}

interface Comment {
  id: string; authorType: string; authorId: string; authorName?: string; body: string;
  isInternal: boolean; createdAt: string;
}

interface TimeEntry {
  id: string; userId: string; startedAt: string; endedAt: string | null;
  durationMinutes: number | null; isBillable: boolean; isBilled: boolean;
  rateCents: number | null; notes: string | null; createdAt: string;
  contractId: string | null;
  contractLineItemId: string | null;
  classification: 'covered' | 'billable' | 'overage' | 'internal';
  internalCategory: string | null;
  nonBillableReason: 'communication' | 'goodwill' | 'rework' | 'travel' | null;
  costRateCents: number | null;
  billRateCents: number | null;
  costCents: number | null;
  billableCents: number | null;
}

interface Contract { id: string; name: string; contractType: string; }
interface Customer { id: string; name: string; }

interface ChargeOption {
  contractId: string;
  contractName: string;
  lineItemId: string;
  lineItemDescription: string;
  coveragePolicy: 'inclusive' | 'block' | 'billable';
  isContractDefault: boolean;
  isInternal: boolean;
  rateCents: number | null;
  overageRateCents: number | null;
  blockHoursTotal: number | null;
  blockHoursRemaining: number | null;
  expiresAt: string | null;
  warnAtPct: number;
}

interface ChargeOptionsResponse {
  ticketContractId: string | null;
  suggestedLineItemId: string | null;
  options: ChargeOption[];
}

const INTERNAL_CATEGORIES = [
  { value: 'admin', label: 'Internal · Admin' },
  { value: 'training', label: 'Internal · Training' },
  { value: 'sales', label: 'Internal · Sales' },
  { value: 'rnd', label: 'Internal · R&D' },
  { value: 'pto', label: 'Internal · PTO' },
  { value: 'travel_unbillable', label: 'Internal · Travel (unbilled)' },
] as const;

// Quick comms is auto-suggested when duration is at or below this threshold (and the
// line is otherwise billable). Tech can always uncheck.
const COMMS_AUTO_THRESHOLD_MIN = 5;

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
  const [categories, setCategories] = useState<TicketCategory[]>([]);

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

  // AI assist
  const [aiSummary, setAiSummary] = useState('');
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [aiImproving, setAiImproving] = useState(false);
  const [aiImprovedText, setAiImprovedText] = useState('');
  const [showAiPreview, setShowAiPreview] = useState(false);

  // Charge-to options (eligible contract line items + Internal overhead)
  const [chargeOptions, setChargeOptions] = useState<ChargeOption[]>([]);
  const [suggestedLineItemId, setSuggestedLineItemId] = useState<string | null>(null);

  // Time entry form (manual log + stop-timer dialog share this state)
  const [timeForm, setTimeForm] = useState<{
    durationMinutes: string;
    notes: string;
    target: string;            // chargeOption.lineItemId, or `internal:<category>`, or '' (none yet)
    nonBillableComms: boolean; // checkbox in form
  }>({ durationMinutes: '', notes: '', target: '', nonBillableComms: false });
  const [submittingTime, setSubmittingTime] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Live timer (one running timer per ticket detail view)
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  // Time entry editing
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeForm, setEditTimeForm] = useState<{
    durationMinutes: string;
    notes: string;
    target: string;
    nonBillableComms: boolean;
  }>({ durationMinutes: '', notes: '', target: '', nonBillableComms: false });

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

  const loadChargeOptions = useCallback(async () => {
    try {
      const data = await api<ChargeOptionsResponse>(`/tickets/${ticketId}/charge-to-options`);
      setChargeOptions(data.options);
      setSuggestedLineItemId(data.suggestedLineItemId);
      // Pre-select the suggested line item if the form hasn't been touched.
      setTimeForm((prev) => (prev.target ? prev : { ...prev, target: data.suggestedLineItemId ?? '' }));
    } catch {
      setChargeOptions([]);
    }
  }, [ticketId]);

  // Live tick counter for SLA countdown
  const [, setTick] = useState(0);

  useEffect(() => {
    async function init() {
      const t = await loadTicket();
      loadComments();
      loadTimeEntries();
      loadCustomerName(t.customerId);
      loadContracts(t.customerId);
      loadChargeOptions();
      api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
      api<TicketCategory[]>('/ticket-categories').then(setCategories).catch(() => {});
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
  }, [loadTicket, loadComments, loadTimeEntries, loadCustomerName, loadContracts, loadChargeOptions]);

  // Live timer ticker — updates every second while running, stops cleanly otherwise.
  useEffect(() => {
    if (!timerStartedAt) return;
    const id = setInterval(() => {
      setTimerElapsedSeconds(Math.floor((Date.now() - timerStartedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [timerStartedAt]);

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

  // Build the resolver payload from a (target, comms, notes, duration, startedAt) tuple.
  function buildTimeEntryBody(args: {
    target: string;
    durationMinutes: number;
    startedAt: Date;
    notes: string | null;
    nonBillableComms: boolean;
  }) {
    const startedAtIso = args.startedAt.toISOString();
    const endedAt = new Date(args.startedAt.getTime() + args.durationMinutes * 60_000).toISOString();
    const base = {
      ticketId,
      startedAt: startedAtIso,
      endedAt,
      durationMinutes: args.durationMinutes,
      notes: args.notes,
    };
    if (args.target.startsWith('internal:')) {
      const internalCategory = args.target.slice('internal:'.length);
      return { ...base, classification: 'internal', internalCategory };
    }
    return {
      ...base,
      contractLineItemId: args.target || undefined,
      nonBillableReason: args.nonBillableComms ? 'communication' : undefined,
    };
  }

  // Friendly toast text after a successful save.
  function describeSaveResult(result: {
    entries: TimeEntry[];
    billingReason?: string;
    warning?: { type: string; remainingHours: number };
  }, target: string) {
    const totalMins = result.entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
    const opt = chargeOptions.find((o) => o.lineItemId === target);
    const where = target.startsWith('internal:')
      ? 'Internal · ' + target.slice('internal:'.length)
      : opt
        ? `${opt.contractName} — ${opt.lineItemDescription}`
        : 'time entry';
    const dur = formatDuration(totalMins);

    if (result.warning?.type === 'block_exhausted') {
      return `Logged ${dur} to ${where}. Block exhausted — overage billed.`;
    }
    if (result.billingReason === 'block_covered' && opt?.blockHoursTotal) {
      const remaining = (opt.blockHoursRemaining ?? 0) - totalMins / 60;
      return `Logged ${dur} to ${where}. ${remaining.toFixed(1)}h remaining.`;
    }
    if (result.billingReason === 'internal') {
      return `Logged ${dur} as ${where}.`;
    }
    return `Logged ${dur} to ${where}.`;
  }

  async function submitTimeEntry(e: React.FormEvent) {
    e.preventDefault();
    setTimeError(null);
    const mins = parseInt(timeForm.durationMinutes, 10);
    if (!mins || mins <= 0) {
      setTimeError('Duration must be greater than 0.');
      return;
    }
    if (!timeForm.target) {
      setTimeError('Pick what to charge this time to.');
      return;
    }
    setSubmittingTime(true);
    try {
      const body = buildTimeEntryBody({
        target: timeForm.target,
        durationMinutes: mins,
        startedAt: new Date(),
        notes: timeForm.notes || null,
        nonBillableComms: timeForm.nonBillableComms,
      });
      const res = await api<{ entries: TimeEntry[]; billingReason?: string; warning?: { type: string; remainingHours: number } }>(
        `/tickets/${ticketId}/time-entries`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setLastAction(describeSaveResult(res, timeForm.target));
      setTimeForm({ durationMinutes: '', notes: '', target: suggestedLineItemId ?? '', nonBillableComms: false });
      setShowTimeForm(false);
      await Promise.all([loadTimeEntries(), loadChargeOptions()]);
    } catch (err) {
      if (err instanceof ApiError) {
        setTimeError(err.message);
      } else {
        setTimeError('Failed to log time entry.');
      }
    } finally {
      setSubmittingTime(false);
    }
  }

  // Quick Reply: instant 2-minute non-billable comms entry. No modal, no friction.
  async function logQuickReply(durationMinutes = 2) {
    setTimeError(null);
    const target = suggestedLineItemId ?? timeForm.target;
    if (!target) {
      // No contract attached — open the form so the tech picks Internal · Admin or a contract.
      setTimeForm({ durationMinutes: String(durationMinutes), notes: 'Quick communication', target: '', nonBillableComms: true });
      setShowTimeForm(true);
      setTimeError('Pick a contract or Internal category for this quick reply.');
      return;
    }
    setSubmittingTime(true);
    try {
      const body = buildTimeEntryBody({
        target,
        durationMinutes,
        startedAt: new Date(),
        notes: 'Quick communication',
        nonBillableComms: true,
      });
      const res = await api<{ entries: TimeEntry[]; billingReason?: string; warning?: { type: string; remainingHours: number } }>(
        `/tickets/${ticketId}/time-entries`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setLastAction(`Logged ${durationMinutes}m comms (non-billable).` + (res.warning ? ' [' + res.warning.type + ']' : ''));
      await Promise.all([loadTimeEntries(), loadChargeOptions()]);
    } catch (err) {
      setTimeError(err instanceof ApiError ? err.message : 'Failed to log quick reply.');
    } finally {
      setSubmittingTime(false);
    }
  }

  // Stop-timer flow: opens the modal with prefilled duration, charge-to, and auto-comms suggestion.
  function startTimer() {
    setTimerStartedAt(new Date());
    setTimerElapsedSeconds(0);
  }

  function stopTimer() {
    if (!timerStartedAt) return;
    const minutes = Math.max(1, Math.round((Date.now() - timerStartedAt.getTime()) / 60000));
    setTimeForm({
      durationMinutes: String(minutes),
      notes: '',
      target: suggestedLineItemId ?? timeForm.target ?? '',
      // Auto-suggest comms checkbox for short bursts.
      nonBillableComms: minutes <= COMMS_AUTO_THRESHOLD_MIN,
    });
    setStopDialogOpen(true);
  }

  function discardTimer() {
    setTimerStartedAt(null);
    setTimerElapsedSeconds(0);
  }

  async function saveStopDialog() {
    setTimeError(null);
    const mins = parseInt(timeForm.durationMinutes, 10);
    if (!mins || mins <= 0) {
      setTimeError('Duration must be greater than 0.');
      return;
    }
    if (!timeForm.target) {
      setTimeError('Pick what to charge this time to.');
      return;
    }
    setSubmittingTime(true);
    try {
      const startedAt = timerStartedAt ?? new Date(Date.now() - mins * 60_000);
      const body = buildTimeEntryBody({
        target: timeForm.target,
        durationMinutes: mins,
        startedAt,
        notes: timeForm.notes || null,
        nonBillableComms: timeForm.nonBillableComms,
      });
      const res = await api<{ entries: TimeEntry[]; billingReason?: string; warning?: { type: string; remainingHours: number } }>(
        `/tickets/${ticketId}/time-entries`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setLastAction(describeSaveResult(res, timeForm.target));
      setTimerStartedAt(null);
      setTimerElapsedSeconds(0);
      setStopDialogOpen(false);
      setTimeForm({ durationMinutes: '', notes: '', target: suggestedLineItemId ?? '', nonBillableComms: false });
      await Promise.all([loadTimeEntries(), loadChargeOptions()]);
    } catch (err) {
      setTimeError(err instanceof ApiError ? err.message : 'Failed to log time entry.');
    } finally {
      setSubmittingTime(false);
    }
  }

  // -------------------------------------------------------------------------
  // Time entry edit / delete
  // -------------------------------------------------------------------------

  function openEditTime(entry: TimeEntry) {
    if (entry.isBilled) return; // server enforces too, but bail early in UI
    setEditingTimeId(entry.id);
    const target =
      entry.classification === 'internal'
        ? `internal:${entry.internalCategory ?? 'admin'}`
        : entry.contractLineItemId ?? '';
    setEditTimeForm({
      durationMinutes: String(entry.durationMinutes ?? ''),
      notes: entry.notes ?? '',
      target,
      nonBillableComms: entry.nonBillableReason === 'communication',
    });
  }

  async function saveTimeEdit() {
    if (!editingTimeId) return;
    const mins = parseInt(editTimeForm.durationMinutes, 10);
    if (!mins || mins <= 0) {
      setTimeError('Duration must be greater than 0.');
      return;
    }
    if (!editTimeForm.target) {
      setTimeError('Pick what to charge this time to.');
      return;
    }
    const isInternal = editTimeForm.target.startsWith('internal:');
    const body: Record<string, unknown> = {
      durationMinutes: mins,
      notes: editTimeForm.notes || null,
    };
    if (isInternal) {
      body.classification = 'internal';
      body.internalCategory = editTimeForm.target.slice('internal:'.length);
      body.nonBillableReason = null;
    } else {
      body.classification = 'covered'; // resolver will recompute based on the line's policy
      body.contractLineItemId = editTimeForm.target;
      body.nonBillableReason = editTimeForm.nonBillableComms ? 'communication' : null;
    }
    try {
      await api(`/time-entries/${editingTimeId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditingTimeId(null);
      setTimeError(null);
      await Promise.all([loadTimeEntries(), loadChargeOptions()]);
    } catch (err) {
      setTimeError(err instanceof ApiError ? err.message : 'Failed to update entry.');
    }
  }

  async function deleteTimeEntry(entryId: string) {
    try {
      await api(`/time-entries/${entryId}`, { method: 'DELETE' });
      await Promise.all([loadTimeEntries(), loadChargeOptions()]);
    } catch (err) {
      setTimeError(err instanceof ApiError ? err.message : 'Failed to delete entry.');
    }
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
      <div className="flex flex-col lg:flex-row gap-4 items-start">
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

              {/* AI Summary */}
              <div className="mt-3">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                  disabled={aiSummarizing}
                  onClick={async () => {
                    setAiSummarizing(true); setAiSummary('');
                    try {
                      const res = await api<{ summary: string }>('/ai/summarize-ticket', {
                        method: 'POST', body: JSON.stringify({ ticketId }),
                      });
                      setAiSummary(res.summary);
                    } catch (err: any) { setAiSummary(`Error: ${err.message || 'AI unavailable'}`); }
                    finally { setAiSummarizing(false); }
                  }}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {aiSummarizing ? 'Summarizing...' : 'AI Summary'}
                </Button>
                {aiSummary && (
                  <div className="mt-2 p-3 rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Summary</span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setAiSummary('')}><X className="h-3 w-3" /></Button>
                    </div>
                    <div className="text-muted-foreground whitespace-pre-wrap">{aiSummary}</div>
                  </div>
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
                              {c.authorName || 'Technician'}
                            </Badge>
                          )}
                          {c.authorType === 'contact' && (
                            <Badge variant="secondary" className="text-xs gap-1 font-normal">
                              <Users className="h-3 w-3" />
                              {c.authorName || 'Customer'}
                            </Badge>
                          )}
                          {c.authorType === 'system' && (
                            <Badge variant="outline" className="text-xs gap-1 font-normal text-muted-foreground">
                              <AlertCircle className="h-3 w-3" />
                              {c.authorName || 'System'}
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
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={aiImproving || !commentBody.trim()}
                    onClick={async () => {
                      setAiImproving(true);
                      try {
                        const res = await api<{ improvedText: string }>('/ai/improve-reply', {
                          method: 'POST',
                          body: JSON.stringify({ draftText: commentBody, ticketSubject: ticket?.subject || '' }),
                        });
                        setAiImprovedText(res.improvedText);
                        setShowAiPreview(true);
                      } catch { /* ignore */ }
                      finally { setAiImproving(false); }
                    }}
                    className="gap-1 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiImproving ? 'Improving...' : 'AI Improve'}
                  </Button>
                </div>
                {/* AI Improved Reply Preview */}
                {showAiPreview && aiImprovedText && (
                  <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Suggestion</span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowAiPreview(false)}><X className="h-3 w-3" /></Button>
                    </div>
                    <div className="text-sm whitespace-pre-wrap bg-white dark:bg-gray-900 p-2 rounded border">{aiImprovedText}</div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => { setCommentBody(aiImprovedText); setShowAiPreview(false); setAiImprovedText(''); }}
                        className="gap-1 bg-purple-600 hover:bg-purple-700">
                        <Check className="h-3.5 w-3.5" />Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAiPreview(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================ */}
        {/* RIGHT COLUMN — Properties Sidebar                                */}
        {/* ================================================================ */}
        <div className="w-full lg:w-80 shrink-0 space-y-4 order-first lg:order-last">
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

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Category</Label>
                <select
                  value={ticket.categoryId ?? ''}
                  disabled={savingField === 'categoryId'}
                  onChange={e => {
                    const categoryId = e.target.value || null;
                    updateTicketField('categoryId', categoryId);
                    // Clear subcategory when category changes
                    if (ticket.subcategoryId) updateTicketField('subcategoryId', null);
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Subcategory — only show if a category is selected and has subcategories */}
              {ticket.categoryId && (() => {
                const cat = categories.find(c => c.id === ticket.categoryId);
                if (!cat || cat.subcategories.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Subcategory</Label>
                    <select
                      value={ticket.subcategoryId ?? ''}
                      disabled={savingField === 'subcategoryId'}
                      onChange={e => updateTicketField('subcategoryId', e.target.value || null)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select subcategory</option>
                      {cat.subcategories.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Time Entries
              {timeEntries.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({timeEntries.length} {timeEntries.length === 1 ? 'entry' : 'entries'})
                </span>
              )}
            </CardTitle>
            {/* Timer bar — start/stop + Quick Reply + manual log toggle */}
            <div className="flex items-center gap-2">
              {timerStartedAt ? (
                <>
                  <span className="font-mono text-sm tabular-nums px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                    {String(Math.floor(timerElapsedSeconds / 3600)).padStart(2, '0')}:
                    {String(Math.floor((timerElapsedSeconds % 3600) / 60)).padStart(2, '0')}:
                    {String(timerElapsedSeconds % 60).padStart(2, '0')}
                  </span>
                  <Button size="sm" variant="destructive" onClick={stopTimer}>
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                  <Button size="sm" variant="ghost" onClick={discardTimer} title="Discard timer">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={startTimer}>
                  <Play className="h-4 w-4 mr-1" /> Start timer
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => logQuickReply(2)} disabled={submittingTime} title="Log a 2-minute non-billable comms entry">
                <MessageCircle className="h-4 w-4 mr-1" /> Quick reply
              </Button>
              <Button size="sm" onClick={() => setShowTimeForm(!showTimeForm)}>
                {showTimeForm ? (
                  <><X className="h-4 w-4 mr-1" />Cancel</>
                ) : (
                  <><Plus className="h-4 w-4 mr-1" />Log time</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Last-action banner — confirms saves with balance info, replaces toast */}
          {lastAction && (
            <div className="flex items-center justify-between gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <span>{lastAction}</span>
              <button onClick={() => setLastAction(null)} className="text-green-700 hover:text-green-900"><X className="h-3 w-3" /></button>
            </div>
          )}
          {timeError && (
            <div className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span>{timeError}</span>
              <button onClick={() => setTimeError(null)} className="text-red-700 hover:text-red-900"><X className="h-3 w-3" /></button>
            </div>
          )}

          {/* Manual time entry form (Log time button) */}
          {showTimeForm && (
            <form onSubmit={submitTimeEntry} className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Duration (min)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="30"
                    value={timeForm.durationMinutes}
                    onChange={e => {
                      const v = e.target.value;
                      const mins = parseInt(v, 10);
                      // Auto-suggest comms checkbox for short bursts on billable lines.
                      const opt = chargeOptions.find((o) => o.lineItemId === timeForm.target);
                      const autoComms = mins > 0 && mins <= COMMS_AUTO_THRESHOLD_MIN && opt && (opt.coveragePolicy === 'billable' || opt.coveragePolicy === 'block');
                      setTimeForm({ ...timeForm, durationMinutes: v, nonBillableComms: autoComms ? true : timeForm.nonBillableComms });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Charge to</Label>
                  <ChargeToSelect
                    value={timeForm.target}
                    options={chargeOptions}
                    onChange={(v) => setTimeForm({ ...timeForm, target: v })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Notes</Label>
                <Input
                  placeholder="What did you work on?"
                  value={timeForm.notes}
                  onChange={e => setTimeForm({ ...timeForm, notes: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={timeForm.nonBillableComms}
                    onChange={e => setTimeForm({ ...timeForm, nonBillableComms: e.target.checked })}
                    className="rounded border-gray-300"
                    disabled={timeForm.target.startsWith('internal:')}
                  />
                  <span className="text-sm text-muted-foreground">Don't bill — quick communication</span>
                </label>
                <Button type="submit" size="sm" disabled={submittingTime}>
                  {submittingTime ? 'Logging...' : 'Log entry'}
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
                    <th className="text-left p-3 font-medium">Charged to</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map(entry => (
                    editingTimeId === entry.id ? (
                      <tr key={entry.id} className="border-b bg-muted/30">
                        <td className="p-2" colSpan={1}>
                          <Input type="number" min="1" className="w-24 h-8" value={editTimeForm.durationMinutes}
                            onChange={e => setEditTimeForm({...editTimeForm, durationMinutes: e.target.value})} />
                        </td>
                        <td className="p-2"></td>
                        <td className="p-2">
                          <ChargeToSelect
                            value={editTimeForm.target}
                            options={chargeOptions}
                            onChange={(v) => setEditTimeForm({ ...editTimeForm, target: v })}
                          />
                        </td>
                        <td className="p-2">
                          <Input className="h-8" value={editTimeForm.notes}
                            onChange={e => setEditTimeForm({...editTimeForm, notes: e.target.value})} />
                        </td>
                        <td className="p-2 text-center">
                          <label className="flex items-center gap-1 justify-center">
                            <input type="checkbox" checked={editTimeForm.nonBillableComms}
                              disabled={editTimeForm.target.startsWith('internal:')}
                              onChange={e => setEditTimeForm({...editTimeForm, nonBillableComms: e.target.checked})} />
                            <span className="text-xs">Comms</span>
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
                        <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">
                          {chargedToLabel(entry, chargeOptions)}
                        </td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">
                          {entry.notes || <span className="italic">No notes</span>}
                          {entry.nonBillableReason === 'communication' && (
                            <Badge variant="outline" className="ml-2 text-[10px]">comms</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <ClassificationBadge entry={entry} />
                          {entry.isBilled && (
                            <Badge variant="outline" className="ml-1 text-xs">Billed</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {entry.billableCents != null && entry.billableCents > 0
                            ? formatCents(entry.billableCents)
                            : '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={entry.isBilled}
                              title={entry.isBilled ? 'Already billed — cannot edit' : 'Edit'}
                              onClick={() => openEditTime(entry)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={entry.isBilled}
                              title={entry.isBilled ? 'Already billed — cannot delete' : 'Delete'}
                              onClick={() => deleteTimeEntry(entry.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
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
              No time logged yet. Start a timer or click "Log time" to add an entry.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Stop-timer dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={(open) => { if (!open) setStopDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Logged {timeForm.durationMinutes || '0'}m</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {timeError && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{timeError}</div>
            )}
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <Label className="text-sm">Duration (min)</Label>
              <Input type="number" min="1" value={timeForm.durationMinutes}
                onChange={e => setTimeForm({ ...timeForm, durationMinutes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Charge to</Label>
              <ChargeToSelect
                value={timeForm.target}
                options={chargeOptions}
                onChange={(v) => setTimeForm({ ...timeForm, target: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Input placeholder="What did you work on?" value={timeForm.notes}
                onChange={e => setTimeForm({ ...timeForm, notes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={timeForm.nonBillableComms}
                onChange={e => setTimeForm({ ...timeForm, nonBillableComms: e.target.checked })}
                className="rounded border-gray-300"
                disabled={timeForm.target.startsWith('internal:')}
              />
              <span className="text-sm text-muted-foreground">Don't bill — quick communication</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setStopDialogOpen(false); discardTimer(); }}>Discard</Button>
            <Button onClick={saveStopDialog} disabled={submittingTime}>
              {submittingTime ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (file-scope) — Charge-to dropdown + display helpers
// ---------------------------------------------------------------------------

function ChargeToSelect({ value, options, onChange }: {
  value: string;
  options: ChargeOption[];
  onChange: (v: string) => void;
}) {
  // Group: customer contracts first (with their lines), then Internal options.
  const customerOptions = options.filter((o) => !o.isInternal);
  const internalOptions = options.filter((o) => o.isInternal);
  return (
    <select
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— pick one —</option>
      {customerOptions.length > 0 && (
        <optgroup label="Customer contracts">
          {customerOptions.map((o) => (
            <option key={o.lineItemId} value={o.lineItemId}>
              {o.contractName} — {o.lineItemDescription}
              {o.coveragePolicy === 'block' && o.blockHoursRemaining != null
                ? ` · ${o.blockHoursRemaining.toFixed(1)}h left`
                : o.coveragePolicy === 'billable' && o.rateCents
                  ? ` · ${formatCents(o.rateCents)}/hr`
                  : ' · covered'}
              {o.isContractDefault ? ' (default)' : ''}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Internal (overhead)">
        {INTERNAL_CATEGORIES.map((c) => (
          <option key={c.value} value={`internal:${c.value}`}>{c.label}</option>
        ))}
        {internalOptions.length === 0 && (
          <option disabled>(no Internal contract — contact admin)</option>
        )}
      </optgroup>
    </select>
  );
}

function chargedToLabel(entry: TimeEntry, options: ChargeOption[]): string {
  if (entry.classification === 'internal') {
    return 'Internal · ' + (entry.internalCategory ?? 'admin');
  }
  const opt = options.find((o) => o.lineItemId === entry.contractLineItemId);
  if (opt) return `${opt.contractName} — ${opt.lineItemDescription}`;
  return entry.contractLineItemId ? '(line removed)' : '—';
}

function ClassificationBadge({ entry }: { entry: TimeEntry }) {
  switch (entry.classification) {
    case 'covered':
      return entry.nonBillableReason === 'communication'
        ? <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Comms</Badge>
        : <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">Covered</Badge>;
    case 'billable':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Billable</Badge>;
    case 'overage':
      return <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">Overage</Badge>;
    case 'internal':
      return <Badge variant="outline">Internal</Badge>;
    default:
      return <Badge variant="secondary">{entry.classification}</Badge>;
  }
}
