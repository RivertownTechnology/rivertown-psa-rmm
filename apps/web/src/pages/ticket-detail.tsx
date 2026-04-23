import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Clock, MessageSquare, Pencil, Check, X, ChevronDown, ChevronUp,
  Eye, EyeOff, Plus, Timer, User, Users, AlertCircle, Send, Trash2, Sparkles,
  Monitor, ExternalLink, FileText, GitMerge, Search, Paperclip,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  slaPausedAt: string | null; slaTotalPausedMs: number | null;
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
// Skeleton Loading
// ---------------------------------------------------------------------------

function TicketDetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-5 w-48" />
      {/* Header row skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      {/* Two-column layout skeleton */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Left column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Subject / description card */}
          <div className="rounded-xl border bg-card p-4 shadow space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-6 w-3/4" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
          {/* Conversation card */}
          <div className="rounded-xl border bg-card p-4 shadow space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        {/* Right column */}
        <div className="w-full lg:w-80 shrink-0 space-y-4 order-first lg:order-last">
          <div className="rounded-xl border bg-card p-4 shadow space-y-4">
            <Skeleton className="h-5 w-24" />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketDetailPage({ ticketId, onBack, onNavigateToCustomer, onNavigate }: {
  ticketId: string;
  onBack: () => void;
  onNavigateToCustomer: (id: string) => void;
  onNavigate?: (path: string) => void;
}) {
  // Core data
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customerContacts, setCustomerContacts] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [customerAssets, setCustomerAssets] = useState<Array<{ id: string; name: string; assetType: string; screenconnectSessionId: string | null; screenconnectOnline: boolean }>>([]);
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
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI assist
  const [aiSummary, setAiSummary] = useState('');
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [aiImproving, setAiImproving] = useState(false);
  const [aiImprovedText, setAiImprovedText] = useState('');
  const [showAiPreview, setShowAiPreview] = useState(false);

  // Time entry form
  const [timeForm, setTimeForm] = useState({ durationMinutes: '', notes: '', isBillable: true });
  const [submittingTime, setSubmittingTime] = useState(false);

  // Time entry editing
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeForm, setEditTimeForm] = useState({ durationMinutes: '', notes: '', isBillable: true });

  // Canned responses
  const [showCannedResponses, setShowCannedResponses] = useState(false);
  const [cannedResponses, setCannedResponses] = useState<Array<{ id: string; name: string; body: string }>>([]);
  const [cannedSearch, setCannedSearch] = useState('');
  const [cannedLoading, setCannedLoading] = useState(false);

  // Custom fields
  const [customFields, setCustomFields] = useState<Array<{ id: string; fieldLabel: string; fieldName: string; fieldType: string; options: unknown; required: boolean; value: string | null }>>([]);

  // Merge ticket
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeResults, setMergeResults] = useState<Array<{ id: string; ticketNumber: number; subject: string }>>([]);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  // Saving states
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const loadContacts = useCallback(async (customerId: string) => {
    try {
      const data = await api<{ data: Array<{ id: string; firstName: string; lastName: string; email: string }> }>(`/contacts?customerId=${customerId}&limit=100`);
      setCustomerContacts(data.data);
    } catch {
      setCustomerContacts([]);
    }
  }, []);

  const loadAssets = useCallback(async (customerId: string) => {
    try {
      const data = await api<{ data: Array<{ id: string; name: string; assetType: string; screenconnectSessionId: string | null; screenconnectOnline: boolean }> }>(`/assets?customerId=${customerId}&limit=200`);
      setCustomerAssets(data.data);
    } catch {
      setCustomerAssets([]);
    }
  }, []);

  const loadCustomFields = useCallback(async () => {
    try {
      const data = await api<Array<{ id: string; fieldLabel: string; fieldName: string; fieldType: string; options: unknown; required: boolean; value: string | null }>>(`/custom-fields/ticket/${ticketId}`);
      setCustomFields(data);
    } catch { setCustomFields([]); }
  }, [ticketId]);

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
      loadCustomFields();
      loadCustomerName(t.customerId);
      loadContracts(t.customerId);
      loadContacts(t.customerId);
      loadAssets(t.customerId);
      api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
      api<TicketCategory[]>('/ticket-categories').then(setCategories).catch(() => {});
      // Auto-open new tickets when a tech views them
      if (t.status === 'new') {
        await api(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
        loadTicket();
      }
    }
    init();

    // Poll ticket data every 30 seconds for real updates (comments, status changes)
    const dataInterval = setInterval(() => {
      loadTicket();
      loadComments();
      loadTimeEntries();
    }, 30000);

    // Tick every second for live SLA countdown + "updated X ago" display
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, [loadTicket, loadComments, loadTimeEntries, loadCustomFields, loadCustomerName, loadContracts, loadContacts, loadAssets]);

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

      // Upload attachments
      if (commentFiles.length > 0) {
        const commentData = await api<Comment[]>(`/tickets/${ticketId}/comments`);
        const latestComment = commentData?.[commentData.length - 1];
        if (latestComment) {
          for (const file of commentFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('entityType', 'ticket_comment');
            formData.append('entityId', latestComment.id);
            await fetch(`${(import.meta as any).env?.VITE_API_URL || ''}/api/v1/attachments/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
              body: formData,
            }).catch(() => {});
          }
        }
        setCommentFiles([]);
      }

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
  // Canned responses
  // -------------------------------------------------------------------------

  async function fetchCannedResponses() {
    setCannedLoading(true);
    try {
      const data = await api<Array<{ id: string; name: string; body: string }>>('/canned-responses');
      setCannedResponses(Array.isArray(data) ? data : []);
    } catch {
      setCannedResponses([]);
    } finally {
      setCannedLoading(false);
    }
  }

  function insertCannedResponse(body: string) {
    setCommentBody(prev => prev ? prev + '\n' + body : body);
    setShowCannedResponses(false);
    setCannedSearch('');
  }

  // -------------------------------------------------------------------------
  // Merge ticket
  // -------------------------------------------------------------------------

  async function searchTicketsForMerge(query: string) {
    setMergeSearch(query);
    if (!query.trim()) { setMergeResults([]); return; }
    try {
      const res = await api<{ data: Array<{ id: string; ticketNumber: number; subject: string }> }>(`/tickets?search=${encodeURIComponent(query)}&limit=10`);
      setMergeResults((res.data || []).filter(t => t.id !== ticketId));
    } catch {
      setMergeResults([]);
    }
  }

  async function handleMerge() {
    if (!mergeTargetId) return;
    setMerging(true);
    try {
      await api(`/tickets/${ticketId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetTicketId: mergeTargetId }),
      });
      onNavigate?.(`/tickets/${mergeTargetId}`);
    } finally {
      setMerging(false);
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
  // Loading state — Skeleton
  // -------------------------------------------------------------------------

  if (!ticket) {
    return <TicketDetailSkeleton />;
  }

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  // -------------------------------------------------------------------------
  // Timeline comment icon helpers
  // -------------------------------------------------------------------------

  function CommentTimelineIcon({ authorType }: { authorType: string }) {
    if (authorType === 'system') {
      return (
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 z-10">
          <AlertCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </div>
      );
    }
    if (authorType === 'contact') {
      return (
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary shrink-0 z-10">
          <Users className="h-4 w-4 text-secondary-foreground" />
        </div>
      );
    }
    // user (technician) — default
    return (
      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary shrink-0 z-10">
        <User className="h-4 w-4 text-primary-foreground" />
      </div>
    );
  }

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
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => { setShowMergeDialog(true); setMergeSearch(''); setMergeResults([]); setMergeTargetId(''); }}>
          <GitMerge className="h-3.5 w-3.5 mr-1" /> Merge
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
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

          {/* Comments thread — Timeline style */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-0">
              {comments.length === 0 ? (
                <div className="pb-4 text-sm text-muted-foreground">No comments yet. Start the conversation below.</div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto pb-2">
                  {/* Timeline wrapper */}
                  <div className="relative">
                    {comments.map((c, i) => (
                      <div key={c.id} className="relative flex gap-3">
                        {/* Vertical timeline line */}
                        {i < comments.length - 1 && (
                          <div className="absolute left-4 top-8 bottom-0 w-0 border-l-2 border-border" />
                        )}
                        {/* Avatar circle */}
                        <CommentTimelineIcon authorType={c.authorType} />
                        {/* Comment content */}
                        <div className={`flex-1 mb-4 rounded-lg p-3 ${c.isInternal ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' : 'bg-muted/40'}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            {c.authorType === 'user' && (
                              <span className="text-sm font-medium">{c.authorName || 'Technician'}</span>
                            )}
                            {c.authorType === 'contact' && (
                              <span className="text-sm font-medium">{c.authorName || 'Customer'}</span>
                            )}
                            {c.authorType === 'system' && (
                              <span className="text-sm font-medium text-muted-foreground">{c.authorName || 'System'}</span>
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
                </div>
              )}

              {/* Always-visible reply box */}
              <Separator />
              <div className="py-4 space-y-3">
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
                <div className="flex items-center gap-2 flex-wrap">
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
                  <Button type="button" variant="ghost" size="sm" className="gap-1"
                    onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-3.5 w-3.5" />
                    {commentFiles.length > 0 ? `${commentFiles.length} file(s)` : 'Attach'}
                  </Button>
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={e => setCommentFiles(Array.from(e.target.files || []))} />
                  <div className="flex-1" />
                  {/* Canned Responses */}
                  <div className="relative">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!showCannedResponses) {
                          fetchCannedResponses();
                        }
                        setShowCannedResponses(!showCannedResponses);
                        setCannedSearch('');
                      }}
                      className="gap-1"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Canned
                    </Button>
                    {showCannedResponses && (
                      <div className="absolute bottom-full mb-1 right-0 w-72 bg-card border rounded-lg shadow-lg z-50 p-2">
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search responses..."
                            value={cannedSearch}
                            onChange={e => setCannedSearch(e.target.value)}
                            className="pl-7 h-7 text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {cannedLoading ? (
                            <div className="text-xs text-muted-foreground text-center py-3">Loading...</div>
                          ) : cannedResponses.filter(cr =>
                            !cannedSearch || cr.name.toLowerCase().includes(cannedSearch.toLowerCase()) || cr.body.toLowerCase().includes(cannedSearch.toLowerCase())
                          ).length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center py-3">No canned responses found</div>
                          ) : (
                            cannedResponses.filter(cr =>
                              !cannedSearch || cr.name.toLowerCase().includes(cannedSearch.toLowerCase()) || cr.body.toLowerCase().includes(cannedSearch.toLowerCase())
                            ).map(cr => (
                              <button
                                key={cr.id}
                                onClick={() => insertCannedResponse(cr.body)}
                                className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                              >
                                <div className="text-xs font-medium">{cr.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{cr.body}</div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                {/* Selected file attachments */}
                {commentFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {commentFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{f.name}</span>
                        <button onClick={() => setCommentFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                <Combobox
                  options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
                  value={ticket.status}
                  onValueChange={(v) => updateTicketField('status', v)}
                  placeholder="Select status..."
                  disabled={savingField === 'status'}
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Priority</Label>
                <Combobox
                  options={PRIORITY_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
                  value={ticket.priority}
                  onValueChange={(v) => updateTicketField('priority', v)}
                  placeholder="Select priority..."
                  disabled={savingField === 'priority'}
                />
              </div>

              {/* Assigned To */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assigned To</Label>
                <Combobox
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...techs.map(t => ({ value: t.id, label: t.displayName })),
                  ]}
                  value={ticket.assignedTo ?? ''}
                  onValueChange={async (v) => {
                    await api(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ assignedTo: v || null }) });
                    loadTicket();
                  }}
                  placeholder="Select technician..."
                />
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

              {/* Contact */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contact</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No contact assigned' },
                    ...customerContacts.map(c => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.email ? ` (${c.email})` : ''}` })),
                  ]}
                  value={ticket.contactId ?? ''}
                  onValueChange={(v) => updateTicketField('contactId', v || null)}
                  placeholder="Select contact..."
                  disabled={savingField === 'contactId'}
                />
                <p className="text-xs text-muted-foreground">
                  {ticket.contactId ? 'Email replies will go to this contact' : 'No contact — replies use customer billing email'}
                </p>
              </div>

              {/* Asset */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Asset</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No asset' },
                    ...customerAssets.map(a => ({
                      value: a.id,
                      label: `${a.screenconnectOnline ? '\u25CF' : '\u25CB'} ${a.name} (${a.assetType})`,
                    })),
                  ]}
                  value={ticket.assetId ?? ''}
                  onValueChange={(v) => updateTicketField('assetId', v || null)}
                  placeholder="Select asset..."
                  disabled={savingField === 'assetId'}
                />
                {(() => {
                  const selectedAsset = customerAssets.find(a => a.id === ticket.assetId);
                  if (!selectedAsset) return null;
                  return (
                    <div className="space-y-1.5">
                      {selectedAsset.screenconnectSessionId && (
                        <a
                          href={`https://rivertowntechnology.screenconnect.com/Host#Access/All%20Machines///${selectedAsset.screenconnectSessionId}/Join`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                          Remote Connect
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedAsset.screenconnectOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {selectedAsset.screenconnectOnline ? 'Online' : 'Offline'}
                        {selectedAsset.assetType && ` · ${selectedAsset.assetType}`}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Contract */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Contract</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No contract (billable)' },
                    ...contracts.map(c => ({ value: c.id, label: `${c.name} (${c.contractType.replace(/_/g, ' ')})` })),
                  ]}
                  value={ticket.contractId ?? ''}
                  onValueChange={(v) => updateTicketField('contractId', v || null)}
                  placeholder="Select contract..."
                  disabled={savingField === 'contractId'}
                />
                <p className="text-xs text-muted-foreground">
                  {ticket.contractId ? 'Time covered under contract' : 'Time logged will be billable'}
                </p>
              </div>

              <Separator />

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Category</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No category' },
                    ...categories.map(c => ({ value: c.id, label: c.name })),
                  ]}
                  value={ticket.categoryId ?? ''}
                  onValueChange={(v) => {
                    const categoryId = v || null;
                    updateTicketField('categoryId', categoryId);
                    // Clear subcategory when category changes
                    if (ticket.subcategoryId) updateTicketField('subcategoryId', null);
                  }}
                  placeholder="Select category..."
                  disabled={savingField === 'categoryId'}
                />
              </div>

              {/* Subcategory — only show if a category is selected and has subcategories */}
              {ticket.categoryId && (() => {
                const cat = categories.find(c => c.id === ticket.categoryId);
                if (!cat || cat.subcategories.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Subcategory</Label>
                    <Combobox
                      options={[
                        { value: '', label: 'Select subcategory' },
                        ...cat.subcategories.map(s => ({ value: s.id, label: s.name })),
                      ]}
                      value={ticket.subcategoryId ?? ''}
                      onValueChange={(v) => updateTicketField('subcategoryId', v || null)}
                      placeholder="Select subcategory..."
                      disabled={savingField === 'subcategoryId'}
                    />
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
                      // Account for paused time: shift the due date forward by total paused milliseconds
                      const totalPaused = (ticket.slaTotalPausedMs ?? 0) +
                        (ticket.slaPausedAt ? (now - new Date(ticket.slaPausedAt).getTime()) : 0);
                      const adjustedDue = due + totalPaused;
                      const remaining = adjustedDue - now;
                      const isPaused = ticket.status === 'waiting_on_customer' && !!ticket.slaPausedAt;

                      if (remaining <= 0 && !isPaused) return <Badge variant="destructive">SLA Breached</Badge>;
                      const hours = Math.floor(Math.abs(remaining) / 3600000);
                      const mins = Math.floor((Math.abs(remaining) % 3600000) / 60000);
                      const total = adjustedDue - new Date(ticket.createdAt).getTime();
                      const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
                      const color = isPaused ? 'bg-purple-500' : remaining < total * 0.25 ? 'bg-yellow-500' : 'bg-green-500';
                      return (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">
                            {isPaused ? (
                              <span className="text-purple-600 dark:text-purple-400 font-medium">SLA Paused — {hours}h {mins}m remaining when resumed</span>
                            ) : (
                              <>{hours}h {mins}m remaining</>
                            )}
                          </div>
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

          {/* ============================================================== */}
          {/* CUSTOM FIELDS — In sidebar                                     */}
          {/* ============================================================== */}
          {customFields.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Custom Fields</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {customFields.map(cf => (
                  <div key={cf.id} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">{cf.fieldLabel}</Label>
                    {cf.fieldType === 'text' && (
                      <Input
                        value={cf.value ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map(f => f.id === cf.id ? { ...f, value: val } : f));
                        }}
                        onBlur={() => {
                          api(`/custom-fields/ticket/${ticketId}`, {
                            method: 'PUT', body: JSON.stringify({ [cf.id]: cf.value || null }),
                          }).catch(() => {});
                        }}
                        placeholder={cf.fieldLabel}
                      />
                    )}
                    {cf.fieldType === 'number' && (
                      <Input
                        type="number"
                        value={cf.value ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map(f => f.id === cf.id ? { ...f, value: val } : f));
                        }}
                        onBlur={() => {
                          api(`/custom-fields/ticket/${ticketId}`, {
                            method: 'PUT', body: JSON.stringify({ [cf.id]: cf.value || null }),
                          }).catch(() => {});
                        }}
                        placeholder={cf.fieldLabel}
                      />
                    )}
                    {cf.fieldType === 'date' && (
                      <Input
                        type="date"
                        value={cf.value ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map(f => f.id === cf.id ? { ...f, value: val } : f));
                          api(`/custom-fields/ticket/${ticketId}`, {
                            method: 'PUT', body: JSON.stringify({ [cf.id]: val || null }),
                          }).catch(() => {});
                        }}
                      />
                    )}
                    {cf.fieldType === 'dropdown' && (
                      <select
                        value={cf.value ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomFields(prev => prev.map(f => f.id === cf.id ? { ...f, value: val } : f));
                          api(`/custom-fields/ticket/${ticketId}`, {
                            method: 'PUT', body: JSON.stringify({ [cf.id]: val || null }),
                          }).catch(() => {});
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Select...</option>
                        {Array.isArray(cf.options) && (cf.options as Array<{ value: string; label: string }>).map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {cf.fieldType === 'checkbox' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cf.value === 'true'}
                          onChange={e => {
                            const val = e.target.checked ? 'true' : 'false';
                            setCustomFields(prev => prev.map(f => f.id === cf.id ? { ...f, value: val } : f));
                            api(`/custom-fields/ticket/${ticketId}`, {
                              method: 'PUT', body: JSON.stringify({ [cf.id]: val }),
                            }).catch(() => {});
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{cf.value === 'true' ? 'Yes' : 'No'}</span>
                      </label>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ============================================================== */}
          {/* TIME ENTRIES — In sidebar                                       */}
          {/* ============================================================== */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Time
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowTimeForm(!showTimeForm)}>
                  {showTimeForm ? (
                    <><X className="h-3 w-3" />Cancel</>
                  ) : (
                    <><Plus className="h-3 w-3" />Log Time</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Summary */}
              {timeEntries.length > 0 && (
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">{formatDuration(totalMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Billable</span>
                    <span className="font-medium text-green-600">{formatDuration(billableMinutes)}</span>
                  </div>
                </div>
              )}

              {/* Inline time entry form */}
              {showTimeForm && (
                <form onSubmit={submitTimeEntry} className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duration (minutes)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      required
                      placeholder="30"
                      className="h-8"
                      value={timeForm.durationMinutes}
                      onChange={e => setTimeForm({ ...timeForm, durationMinutes: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      placeholder="What did you work on?"
                      className="h-8"
                      value={timeForm.notes}
                      onChange={e => setTimeForm({ ...timeForm, notes: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={timeForm.isBillable}
                      onChange={e => setTimeForm({ ...timeForm, isBillable: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-muted-foreground">Billable</span>
                    {ticket.contractId && (
                      <span className="text-xs text-muted-foreground">(contract)</span>
                    )}
                  </label>
                  <Button type="submit" size="sm" className="w-full h-7 text-xs" disabled={submittingTime}>
                    {submittingTime ? 'Logging...' : 'Log Entry'}
                  </Button>
                </form>
              )}

              {/* Compact time entries list */}
              {timeEntries.length > 0 ? (
                <div className="space-y-1">
                  {timeEntries.map(entry => (
                    editingTimeId === entry.id ? (
                      <div key={entry.id} className="border rounded-lg p-2 bg-muted/30 space-y-2">
                        <div className="flex gap-2">
                          <Input type="number" min="1" className="w-20 h-7 text-xs" placeholder="min" value={editTimeForm.durationMinutes}
                            onChange={e => setEditTimeForm({...editTimeForm, durationMinutes: e.target.value})} />
                          <Input className="h-7 text-xs flex-1" placeholder="Notes" value={editTimeForm.notes}
                            onChange={e => setEditTimeForm({...editTimeForm, notes: e.target.value})} />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={editTimeForm.isBillable}
                              onChange={e => setEditTimeForm({...editTimeForm, isBillable: e.target.checked})}
                              className="rounded border-gray-300" />
                            <span className="text-xs text-muted-foreground">Billable</span>
                          </label>
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-xs px-2" onClick={saveTimeEdit}><Check className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingTimeId(null)}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={entry.id} className="flex items-start gap-2 py-1.5 group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">
                              {entry.durationMinutes ? formatDuration(entry.durationMinutes) : '-'}
                            </span>
                            {entry.isBillable ? (
                              <span className="text-xs text-green-600">$</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">nb</span>
                            )}
                            {entry.isBilled && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">Billed</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {entry.notes || 'No notes'}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(entry.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {entry.rateCents ? ` \u00b7 ${formatCents(entry.rateCents)}/hr` : ''}
                          </div>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTime(entry)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteTimeEntry(entry.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              ) : !showTimeForm ? (
                <div className="text-center text-muted-foreground py-4 text-xs">
                  <Clock className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
                  No time logged yet.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Ticket"
        description={`Permanently delete ticket #${ticket.ticketNumber} "${ticket.subject}"? This will remove all comments, time entries, and associated data. This cannot be undone.`}
        confirmLabel="Delete Ticket"
        variant="destructive"
        onConfirm={async () => {
          await api(`/tickets/${ticketId}`, { method: 'DELETE' });
          onBack();
        }}
      />

      {/* Merge Ticket Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Ticket #{ticket.ticketNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Search for a target ticket to merge this ticket into. Comments, time entries, and attachments will be moved to the target ticket.
            </p>
            <div className="space-y-2">
              <Label>Search for target ticket</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ticket # or subject..."
                  value={mergeSearch}
                  onChange={e => searchTicketsForMerge(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {mergeResults.length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {mergeResults.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setMergeTargetId(t.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0 ${
                      mergeTargetId === t.id ? 'bg-primary/10 font-medium' : ''
                    }`}
                  >
                    <span className="text-muted-foreground font-mono">#{t.ticketNumber}</span>{' '}
                    {t.subject}
                  </button>
                ))}
              </div>
            )}
            {mergeTargetId && (
              <div className="p-2 bg-muted rounded-md text-sm">
                Merging into: <span className="font-medium">
                  #{mergeResults.find(t => t.id === mergeTargetId)?.ticketNumber} - {mergeResults.find(t => t.id === mergeTargetId)?.subject}
                </span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMergeDialog(false)}>Cancel</Button>
              <Button onClick={handleMerge} disabled={merging || !mergeTargetId}>
                <GitMerge className="h-3.5 w-3.5 mr-1" />
                {merging ? 'Merging...' : 'Merge Ticket'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
