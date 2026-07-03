import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import { CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS, statusBadgeClass, formatStatus } from '@/lib/badge-colors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { PopoverFilter } from '@/components/ui/popover-filter';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Search, Trash2, FileText } from 'lucide-react';

interface ContractLineItem {
  id: string;
  contractId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
}

interface Contract {
  id: string; name: string; contractType: string; status: string;
  customerId: string; startDate: string; endDate: string | null;
  billingCycle: string; createdAt: string;
  lineItems?: ContractLineItem[];
  blockHoursIncluded?: number | null;
  blockHoursUsed?: number | null;
}

interface Customer { id: string; name: string; }
interface PaginatedResponse { data: Contract[]; pagination: { total: number; page: number; totalPages: number }; }

const typeLabels: Record<string, string> = {
  managed_services: 'Managed Services', break_fix: 'Break/Fix',
  per_device: 'Per Device', per_user: 'Per User', block_time: 'Block Time',
  recurring_flat: 'Flat Rate', ad_hoc: 'Ad-Hoc',
};

const typeOptions = [
  { value: 'managed_services', label: 'Managed Services' },
  { value: 'break_fix', label: 'Break/Fix' },
  { value: 'per_device', label: 'Per Device' },
  { value: 'per_user', label: 'Per User' },
  { value: 'block_time', label: 'Block Time' },
  { value: 'recurring_flat', label: 'Flat Rate' },
  { value: 'ad_hoc', label: 'Ad-Hoc' },
];

const billingOptions = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusFilterOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function computeMonthlyRevenue(contract: Contract): number {
  if (!contract.lineItems || contract.lineItems.length === 0) return 0;
  const total = contract.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0);
  switch (contract.billingCycle) {
    case 'quarterly': return Math.round(total / 3);
    case 'annual': return Math.round(total / 12);
    default: return total;
  }
}

function computeMonthlyMargin(contract: Contract): number | null {
  if (!contract.lineItems || contract.lineItems.length === 0) return null;
  const revenue = contract.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0);
  const cost = contract.lineItems.reduce((sum, li) => sum + li.quantity * (li.unitCostCents ?? 0), 0);
  if (revenue === 0) return null;
  return ((revenue - cost) / revenue) * 100;
}

export function ContractsPage({ onNavigateToCustomer, onSelectContract }: { onNavigateToCustomer: (id: string) => void; onSelectContract?: (id: string) => void }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    customerId: '', name: '', contractType: 'managed_services', status: 'draft',
    startDate: new Date().toISOString().split('T')[0], billingCycle: 'monthly',
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter.length === 1) params.set('status', statusFilter[0]);
      const data = await api<PaginatedResponse>(`/contracts?${params}`);
      setContracts(data.data);
      setTotal(data.pagination.total);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { loadContracts(); }, [loadContracts]);

  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100')
      .then(d => setCustomers(d.data))
      .catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }));

  const statusOrder: Record<string, number> = { active: 0, draft: 1, expired: 2, cancelled: 3 };

  const filteredContracts = useMemo(() => {
    return contracts
      .filter(c => {
        // Client-side status filter for multi-select
        if (statusFilter.length > 1 && !statusFilter.includes(c.status)) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || (customerMap.get(c.customerId) ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        switch (sort) {
          case 'name_az': return a.name.localeCompare(b.name);
          case 'status': return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
          case 'newest':
          default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [contracts, search, sort, statusFilter, customerMap, statusOrder]);

  // Compute MRR across active contracts
  const mrr = useMemo(() => {
    return contracts
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + computeMonthlyRevenue(c), 0);
  }, [contracts]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/contracts/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadContracts();
    } catch {
      // handled
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api('/contracts', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ customerId: '', name: '', contractType: 'managed_services', status: 'draft', startDate: new Date().toISOString().split('T')[0], billingCycle: 'monthly' });
      loadContracts();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contracts"
        description="Manage recurring agreements and track monthly recurring revenue."
        actions={
          <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />New Contract</Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Combobox
          options={[
            { value: 'newest', label: 'Created (newest)' },
            { value: 'name_az', label: 'Name A-Z' },
            { value: 'status', label: 'Status' },
          ]}
          value={sort}
          onValueChange={setSort}
          placeholder="Sort by..."
          className="w-44"
        />
        <PopoverFilter
          label="Status"
          options={statusFilterOptions}
          selected={statusFilter}
          onSelectionChange={(selected) => { setStatusFilter(selected); setPage(1); }}
        />
        {mrr > 0 && (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-md">
            MRR: {formatCents(mrr)}
          </div>
        )}
      </div>

      {/* Contract Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-40" />
            </CardContent></Card>
          ))}
        </div>
      ) : filteredContracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No contracts found"
          description={search || statusFilter.length > 0 ? "Try adjusting your search or filters." : "Create your first contract to get started."}
          action={!search && statusFilter.length === 0 ? { label: 'New Contract', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filteredContracts.map(c => {
            const monthly = computeMonthlyRevenue(c);
            const margin = computeMonthlyMargin(c);
            const blockTotal = c.blockHoursIncluded ?? 0;
            const blockUsed = c.blockHoursUsed ?? 0;
            const blockRemaining = Math.max(0, blockTotal - blockUsed);
            const blockPct = blockTotal > 0 ? Math.min(100, (blockUsed / blockTotal) * 100) : 0;

            return (
              <Card
                key={c.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onSelectContract?.(c.id)}
              >
                <CardContent className="p-4">
                  {/* Line 1: Name + Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    <Badge variant="secondary" className={`border ${statusBadgeClass(CONTRACT_STATUS_COLORS, c.status)}`}>
                      {formatStatus(c.status, CONTRACT_STATUS_LABELS)}
                    </Badge>
                  </div>

                  {/* Line 2: Customer + Type + Billing */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      className="text-sm text-primary hover:underline"
                      onClick={(e) => { e.stopPropagation(); onNavigateToCustomer(c.customerId); }}
                    >
                      {customerMap.get(c.customerId) ?? '-'}
                    </button>
                    <Badge variant="outline" className="text-xs">{typeLabels[c.contractType] ?? c.contractType}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{c.billingCycle}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.startDate)} — {c.endDate ? formatDate(c.endDate) : 'Ongoing'}
                    </span>
                  </div>

                  {/* Line 3: Revenue, margin, block hours */}
                  <div className="flex items-center gap-4 mt-2">
                    {monthly > 0 && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatCents(monthly)}/mo
                      </span>
                    )}
                    {margin !== null && (
                      <span className={`text-xs font-medium ${margin >= 30 ? 'text-emerald-600' : margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                        {margin.toFixed(0)}% margin
                      </span>
                    )}
                    {blockTotal > 0 && (
                      <div className="flex items-center gap-2 flex-1 max-w-xs">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${blockPct > 90 ? 'bg-red-500' : blockPct > 70 ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{ width: `${blockPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {blockUsed}/{blockTotal} hrs ({blockRemaining} remaining)
                        </span>
                      </div>
                    )}
                    <div className="ml-auto" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Contract"
        description={`Delete "${deleteTarget?.name}"? This will remove all line items. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={customerOptions}
                value={form.customerId}
                onValueChange={(val) => setForm({ ...form, customerId: val })}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
                emptyText="No customers found."
              />
            </div>
            <div className="space-y-2"><Label>Contract Name</Label>
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Managed Services - Acme Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type</Label>
                <Combobox
                  options={typeOptions}
                  value={form.contractType}
                  onValueChange={(val) => setForm({ ...form, contractType: val })}
                  placeholder="Select type..."
                />
              </div>
              <div className="space-y-2"><Label>Billing Cycle</Label>
                <Combobox
                  options={billingOptions}
                  value={form.billingCycle}
                  onValueChange={(val) => setForm({ ...form, billingCycle: val })}
                  placeholder="Select cycle..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Status</Label>
                <Combobox
                  options={statusOptions}
                  value={form.status}
                  onValueChange={(val) => setForm({ ...form, status: val })}
                  placeholder="Select status..."
                />
              </div>
              <div className="space-y-2"><Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Contract'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
