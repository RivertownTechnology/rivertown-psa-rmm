import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { PopoverFilter } from '@/components/ui/popover-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/lib/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Search, Ticket, LayoutList, Kanban, X, Trash2, UserPlus, ArrowRight, GitMerge } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  customerId: string;
  assignedTo: string | null;
  createdAt: string;
  slaResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  slaBreached: boolean | null;
  slaPausedAt: string | null;
  slaTotalPausedMs: number | null;
  queueId: string | null;
}

interface Customer {
  id: string;
  name: string;
}

interface Tech {
  id: string;
  displayName: string;
  email: string;
}

interface Contract {
  id: string;
  name: string;
  contractType: string;
  status: string;
  customerId: string;
}

interface PaginatedResponse {
  data: TicketRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

import { slaCountdown } from '@/lib/sla';

// ---------------------------------------------------------------------------
// Badge style maps
// ---------------------------------------------------------------------------

import { TICKET_STATUS_COLORS, PRIORITY_COLORS, statusBadgeClass as getStatusClass } from '@/lib/badge-colors';

const statusBadgeClass = TICKET_STATUS_COLORS;
const priorityBadgeClass = PRIORITY_COLORS;

function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPriority(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// Solid left-accent color per priority for row scannability.
const PRIORITY_ACCENT: Record<string, string> = {
  low: 'border-l-gray-300 dark:border-l-gray-600',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  critical: 'border-l-red-500',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// ---------------------------------------------------------------------------
// Filter / sort option constants
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

const SORT_OPTIONS = [
  { value: 'newest', label: 'Created (newest)' },
  { value: 'oldest', label: 'Created (oldest)' },
  { value: 'priority', label: 'Priority (high first)' },
  { value: 'number', label: 'Ticket #' },
];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Default view hides closed tickets — they only appear when explicitly selected
// in the status filter.
const DEFAULT_STATUSES = STATUS_OPTIONS.filter(s => s.value !== 'closed').map(s => s.value);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketsPage({ onSelectTicket, onNavigate }: { onSelectTicket?: (id: string) => void; onNavigate?: (path: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();

  // Data state
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter / search / sort state
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [myTicketsOnly, setMyTicketsOnly] = useState(false);

  // Queue filter
  const [queueFilter, setQueueFilter] = useState('');
  const [queueOptions, setQueueOptions] = useState<Array<{ id: string; name: string }>>([]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignTo, setBulkAssignTo] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkQueue, setShowBulkQueue] = useState(false);
  const [bulkQueueId, setBulkQueueId] = useState('');
  const [showBulkMerge, setShowBulkMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  // Ticket templates
  const [ticketTemplates, setTicketTemplates] = useState<Array<{ id: string; name: string; subject: string; body: string; priority: string; category: string }>>([]);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [formContacts, setFormContacts] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [formAssets, setFormAssets] = useState<Array<{ id: string; name: string; assetType: string; screenconnectOnline: boolean }>>([]);
  const [formData, setFormData] = useState({
    customerId: '',
    contactId: '',
    assetId: '',
    subject: '',
    description: '',
    priority: 'medium',
    contractId: '',
    categoryId: '',
    subcategoryId: '',
  });
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }>
  >([]);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      // No explicit status selection → show everything except closed
      params.set('status', (statusFilter.length > 0 ? statusFilter : DEFAULT_STATUSES).join(','));
      if (priorityFilter.length === 1) params.set('priority', priorityFilter[0]);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (myTicketsOnly && user?.id) params.set('assignedTo', user.id);
      if (queueFilter) params.set('queueId', queueFilter);
      const data = await api<PaginatedResponse>(`/tickets?${params}`);
      setTickets(data.data);
      setTotal(data.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, priorityFilter, debouncedSearch, myTicketsOnly, user?.id, queueFilter]);

  const fetchCustomers = useCallback(async () => {
    const data = await api<{ data: Customer[] }>('/customers?limit=100');
    setCustomers(data.data);
  }, []);

  const fetchTechs = useCallback(async () => {
    try {
      const data = await api<Tech[]>('/dispatch/techs');
      setTechs(data);
    } catch {
      // dispatch/techs might not be available
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    fetchCustomers();
    fetchTechs();
    api<Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }>>(
      '/ticket-categories',
    )
      .then(setCategories)
      .catch(() => {});
    api<Array<{ id: string; name: string }>>('/settings/ticket-queues')
      .then(setQueueOptions)
      .catch(() => {});
  }, [fetchCustomers, fetchTechs]);

  // Fetch ticket templates when create dialog opens
  useEffect(() => {
    if (showCreate) {
      api<Array<{ id: string; name: string; subject: string; body: string; priority: string; category: string }>>('/settings/ticket-templates')
        .then(data => setTicketTemplates(Array.isArray(data) ? data : []))
        .catch(() => setTicketTemplates([]));
    }
  }, [showCreate]);

  // ---------------------------------------------------------------------------
  // Lookup maps
  // ---------------------------------------------------------------------------

  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const techMap = new Map(techs.map((t) => [t.id, t.displayName]));

  // ---------------------------------------------------------------------------
  // Client-side sort (API doesn't support sort param yet)
  // ---------------------------------------------------------------------------

  const sortedTickets = [...tickets].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'priority':
        return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      case 'number':
        return b.ticketNumber - a.ticketNumber;
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // ---------------------------------------------------------------------------
  // Create ticket helpers
  // ---------------------------------------------------------------------------

  async function onFormCustomerChange(custId: string) {
    setFormData((f) => ({ ...f, customerId: custId, contactId: '', contractId: '', assetId: '' }));
    if (custId) {
      const [contractData, contactData, assetData] = await Promise.all([
        api<{ data: Contract[] }>(`/contracts?customerId=${custId}&status=active&limit=100`),
        api<{ data: Array<{ id: string; firstName: string; lastName: string; email: string }> }>(`/contacts?customerId=${custId}&limit=100`),
        api<{ data: Array<{ id: string; name: string; assetType: string; screenconnectOnline: boolean }> }>(`/assets?customerId=${custId}&limit=100`).catch(() => ({ data: [] })),
      ]);
      setContracts(contractData.data);
      setFormContacts(contactData.data);
      setFormAssets(assetData.data);
    } else {
      setContracts([]);
      setFormContacts([]);
      setFormAssets([]);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!payload.contactId) delete payload.contactId;
      if (!payload.assetId) delete payload.assetId;
      if (!payload.contractId) delete payload.contractId;
      if (!payload.categoryId) delete payload.categoryId;
      if (!payload.subcategoryId) delete payload.subcategoryId;
      await api('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      setFormData({
        customerId: '',
        contactId: '',
        assetId: '',
        subject: '',
        description: '',
        priority: 'medium',
        contractId: '',
        categoryId: '',
        subcategoryId: '',
      });
      setFormContacts([]);
      setFormAssets([]);
      setContracts([]);
      fetchTickets();
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk action handlers
  // ---------------------------------------------------------------------------

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sortedTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTickets.map(t => t.id)));
    }
  }

  async function bulkAssign() {
    if (!bulkAssignTo || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await api('/tickets/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], update: { assignedTo: bulkAssignTo } }),
      });
      setSelectedIds(new Set());
      setShowBulkAssign(false);
      setBulkAssignTo('');
      fetchTickets();
    } catch (e) {
      toast.error('Bulk assign failed', e instanceof Error ? e.message : undefined);
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkChangeStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await api('/tickets/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], update: { status: bulkStatus } }),
      });
      setSelectedIds(new Set());
      setShowBulkStatus(false);
      setBulkStatus('');
      fetchTickets();
    } catch (e) {
      toast.error('Bulk status update failed', e instanceof Error ? e.message : undefined);
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkClose() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await api('/tickets/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds], update: { status: 'closed' } }),
      });
      setSelectedIds(new Set());
      fetchTickets();
    } catch (e) {
      toast.error('Bulk close failed', e instanceof Error ? e.message : undefined);
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await api('/tickets/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      fetchTickets();
    } catch (e) {
      toast.error('Bulk delete failed', e instanceof Error ? e.message : undefined);
    } finally {
      setBulkLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Combobox options for create dialog
  // ---------------------------------------------------------------------------

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
  const contractOptions = contracts.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.contractType.replace(/_/g, ' ')})`,
  }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const subcategoryOptions =
    categories
      .find((c) => c.id === formData.categoryId)
      ?.subcategories.map((s) => ({ value: s.id, label: s.name })) ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tickets"
        description="Track, triage, and resolve customer service requests."
        actions={
          <>
            {/* View toggle */}
            <div className="flex items-center border rounded-md">
              <Button variant="ghost" size="sm" className="h-8 rounded-r-none bg-accent">
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 rounded-l-none" onClick={() => onNavigate?.('/tickets/board')}>
                <Kanban className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Ticket
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* My Tickets toggle */}
          <Button
            variant={myTicketsOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setMyTicketsOnly(!myTicketsOnly); setPage(1); }}
          >
            My Tickets
          </Button>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Sort combobox */}
          <Combobox
            options={SORT_OPTIONS}
            value={sort}
            onValueChange={setSort}
            placeholder="Sort by..."
            className="w-44"
          />

          {/* Status filter popover */}
          <PopoverFilter
            label="Status"
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onSelectionChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          />

          {/* Priority filter popover */}
          <PopoverFilter
            label="Priority"
            options={PRIORITY_OPTIONS}
            selected={priorityFilter}
            onSelectionChange={(val) => {
              setPriorityFilter(val);
              setPage(1);
            }}
          />

          {/* Queue filter */}
          {queueOptions.length > 0 && (
            <Combobox
              options={[{ value: '', label: 'All Queues' }, ...queueOptions.map(q => ({ value: q.id, label: q.name }))]}
              value={queueFilter}
              onValueChange={(val) => { setQueueFilter(val); setPage(1); }}
              placeholder="Queue..."
              className="w-40"
            />
          )}
        </div>
      </div>

      {/* Ticket count */}
      <div className="text-sm text-muted-foreground">
        {total} ticket{total !== 1 ? 's' : ''}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedTickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No tickets found"
          description={
            debouncedSearch || statusFilter.length > 0 || priorityFilter.length > 0
              ? 'Try adjusting your search or filters.'
              : 'Create your first ticket to get started.'
          }
          action={
            !debouncedSearch && statusFilter.length === 0 && priorityFilter.length === 0
              ? { label: 'New Ticket', onClick: () => setShowCreate(true) }
              : undefined
          }
        />
      ) : (
        <div className="space-y-1">
          {sortedTickets.map((t) => {
            const sla = slaCountdown(t);
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTicket?.(t.id); } }}
                className={`rounded-lg border border-l-4 bg-card px-4 py-3.5 cursor-pointer transition-all hover:bg-muted/50 hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex items-start gap-3 ${PRIORITY_ACCENT[t.priority] ?? 'border-l-transparent'}`}
              >
                {/* Selection indicator */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selectedIds.has(t.id)}
                  aria-label="Select ticket"
                  className="pt-0.5 shrink-0"
                  onClick={e => { e.stopPropagation(); toggleSelect(t.id); }}
                >
                  <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-150 ${
                    selectedIds.has(t.id)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                  }`}>
                    {selectedIds.has(t.id) && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
                <div className="flex-1 min-w-0" onClick={() => onSelectTicket?.(t.id)}>
                {/* Line 1: number + subject + relative time */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      #{t.ticketNumber}
                    </span>
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {relativeTime(t.createdAt)}
                  </span>
                </div>

                {/* Line 2: customer + tech + badges */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {customerMap.get(t.customerId) ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  {t.assignedTo ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[9px] font-semibold flex items-center justify-center shrink-0">
                        {initials(techMap.get(t.assignedTo) ?? '?')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {techMap.get(t.assignedTo) ?? 'Unknown'}
                      </span>
                    </span>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 leading-4 border-0 bg-muted text-muted-foreground"
                    >
                      Unassigned
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 leading-4 border-0 ${statusBadgeClass[t.status] ?? ''}`}
                  >
                    {formatStatus(t.status)}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 leading-4 border-0 ${priorityBadgeClass[t.priority] ?? ''}`}
                  >
                    {formatPriority(t.priority)}
                  </Badge>
                  {sla && (
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 leading-4 border-0 ${sla.className}`}
                    >
                      {sla.text}
                    </Badge>
                  )}
                  {t.queueId && queueOptions.find(q => q.id === t.queueId) && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 leading-4">
                      {queueOptions.find(q => q.id === t.queueId)!.name}
                    </Badge>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border rounded-lg shadow-lg px-4 py-3 flex items-center gap-2 sm:gap-3 z-50 max-w-[calc(100%-2rem)] flex-wrap justify-center">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setShowBulkAssign(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />Assign
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBulkStatus(true)}>
            <ArrowRight className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Change </span>Status
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBulkQueue(true)}>
            Queue
          </Button>
          <Button size="sm" variant="outline" onClick={bulkClose}>
            Close
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBulkMerge(true)} disabled={selectedIds.size < 2}>
            <GitMerge className="h-3.5 w-3.5 mr-1" />Merge
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Bulk Assign Dialog */}
      <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selectedIds.size} Ticket{selectedIds.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Combobox
                options={techs.map(t => ({ value: t.id, label: t.displayName }))}
                value={bulkAssignTo}
                onValueChange={setBulkAssignTo}
                placeholder="Select technician..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkAssign(false)}>Cancel</Button>
              <Button onClick={bulkAssign} disabled={bulkLoading || !bulkAssignTo}>
                {bulkLoading ? 'Assigning...' : 'Assign'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <Dialog open={showBulkStatus} onOpenChange={setShowBulkStatus}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status of {selectedIds.size} Ticket{selectedIds.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Combobox
                options={STATUS_OPTIONS}
                value={bulkStatus}
                onValueChange={setBulkStatus}
                placeholder="Select status..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkStatus(false)}>Cancel</Button>
              <Button onClick={bulkChangeStatus} disabled={bulkLoading || !bulkStatus}>
                {bulkLoading ? 'Updating...' : 'Update Status'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Queue Dialog */}
      <Dialog open={showBulkQueue} onOpenChange={setShowBulkQueue}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Queue for {selectedIds.size} tickets</DialogTitle></DialogHeader>
          <Combobox
            options={[{ value: '', label: 'No queue' }, ...queueOptions.map(q => ({ value: q.id, label: q.name }))]}
            value={bulkQueueId}
            onValueChange={setBulkQueueId}
            placeholder="Select queue..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkQueue(false)}>Cancel</Button>
            <Button onClick={async () => {
              try {
                await api('/tickets/bulk-update', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], update: { queueId: bulkQueueId || null } }) });
              } catch (e) {
                toast.error('Failed to change queue', e instanceof Error ? e.message : undefined);
                return;
              }
              setShowBulkQueue(false);
              setBulkQueueId('');
              setSelectedIds(new Set());
              fetchTickets();
            }}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Ticket{selectedIds.size !== 1 ? 's' : ''}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the selected tickets and all associated data. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={bulkDelete} disabled={bulkLoading}>
              {bulkLoading ? 'Deleting...' : 'Delete Tickets'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Merge Dialog */}
      <Dialog open={showBulkMerge} onOpenChange={setShowBulkMerge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selectedIds.size} Tickets</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Select the ticket to keep. All other selected tickets will be merged into it (comments and time entries moved, source tickets closed).</p>
          <Combobox
            options={[...selectedIds].map(id => {
              const t = tickets.find(t => t.id === id);
              return { value: id, label: t ? `#${t.ticketNumber} — ${t.subject}` : id };
            })}
            value={mergeTargetId}
            onValueChange={setMergeTargetId}
            placeholder="Select target ticket..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkMerge(false)}>Cancel</Button>
            <Button disabled={!mergeTargetId || merging} onClick={async () => {
              setMerging(true);
              const sources = [...selectedIds].filter(id => id !== mergeTargetId);
              try {
                for (const sourceId of sources) {
                  await api(`/tickets/${sourceId}/merge`, { method: 'POST', body: JSON.stringify({ targetTicketId: mergeTargetId }) });
                }
              } catch (e) {
                toast.error('Merge failed', e instanceof Error ? e.message : undefined);
                setMerging(false);
                return;
              }
              setMerging(false);
              setShowBulkMerge(false);
              setSelectedIds(new Set());
              setMergeTargetId('');
              fetchTickets();
            }}>
              {merging ? 'Merging...' : 'Merge into selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Ticket</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {ticketTemplates.length > 0 && (
              <div className="space-y-2">
                <Label>Template</Label>
                <select
                  onChange={e => {
                    const tpl = ticketTemplates.find(t => t.id === e.target.value);
                    if (tpl) {
                      setFormData(f => ({
                        ...f,
                        subject: tpl.subject || f.subject,
                        description: tpl.body || f.description,
                        priority: tpl.priority || f.priority,
                      }));
                    }
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="">No template</option>
                  {ticketTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={customerOptions}
                value={formData.customerId}
                onValueChange={(val) => onFormCustomerChange(val)}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
                emptyText="No customers found."
              />
            </div>

            {formContacts.length > 0 && (
              <div className="space-y-2">
                <Label>Contact</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No contact' },
                    ...formContacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.email ? ` (${c.email})` : ''}` })),
                  ]}
                  value={formData.contactId}
                  onValueChange={(val) => setFormData({ ...formData, contactId: val })}
                  placeholder="Select contact..."
                  searchPlaceholder="Search contacts..."
                  emptyText="No contacts found."
                />
                <p className="text-xs text-muted-foreground">
                  {formData.contactId ? 'Email replies will go to this contact' : 'Replies will use customer billing email'}
                </p>
              </div>
            )}

            {formAssets.length > 0 && (
              <div className="space-y-2">
                <Label>Asset</Label>
                <Combobox
                  options={[
                    { value: '', label: 'No asset' },
                    ...formAssets.map((a) => ({
                      value: a.id,
                      label: `${a.screenconnectOnline ? '\u25CF' : '\u25CB'} ${a.name} (${a.assetType})`,
                    })),
                  ]}
                  value={formData.assetId}
                  onValueChange={(val) => setFormData({ ...formData, assetId: val })}
                  placeholder="Select asset..."
                  searchPlaceholder="Search assets..."
                  emptyText="No assets found."
                />
              </div>
            )}

            {contracts.length > 0 && (
              <div className="space-y-2">
                <Label>Contract</Label>
                <Combobox
                  options={[{ value: '', label: 'No contract (billable)' }, ...contractOptions]}
                  value={formData.contractId}
                  onValueChange={(val) => setFormData({ ...formData, contractId: val })}
                  placeholder="Select contract..."
                  searchPlaceholder="Search contracts..."
                  emptyText="No contracts found."
                />
                <p className="text-xs text-muted-foreground">
                  {formData.contractId ? 'Work covered under contract' : 'Time logged will be billable'}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Combobox
                options={PRIORITY_OPTIONS}
                value={formData.priority}
                onValueChange={(val) => setFormData({ ...formData, priority: val })}
                placeholder="Select priority..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Combobox
                  options={[{ value: '', label: 'No category' }, ...categoryOptions]}
                  value={formData.categoryId}
                  onValueChange={(val) =>
                    setFormData({ ...formData, categoryId: val, subcategoryId: '' })
                  }
                  placeholder="Select category..."
                  searchPlaceholder="Search categories..."
                  emptyText="No categories."
                />
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <Combobox
                  options={
                    formData.categoryId
                      ? [{ value: '', label: 'No subcategory' }, ...subcategoryOptions]
                      : []
                  }
                  value={formData.subcategoryId}
                  onValueChange={(val) => setFormData({ ...formData, subcategoryId: val })}
                  placeholder={formData.categoryId ? 'Select subcategory...' : 'Select category first'}
                  disabled={!formData.categoryId}
                  emptyText="No subcategories."
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
