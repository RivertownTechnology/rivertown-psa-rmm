import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/lib/toast';
import { Trash2, RefreshCw, Search, Receipt } from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: number;
  customerId: string;
  status: string;
  issueDate: string;
  dueDate: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  notes: string | null;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
}

interface PaginatedResponse {
  data: Invoice[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'default',
  paid: 'secondary',
  overdue: 'destructive',
  void: 'secondary',
};

export function InvoicesPage({ onNavigateToCustomer, onSelectInvoice }: { onNavigateToCustomer: (id: string) => void; onSelectInvoice?: (id: string) => void }) {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; invoiceNumber: number } | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: '',
    dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })(),
    notes: '',
  });
  const [genDueDate, setGenDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api<PaginatedResponse>(`/invoices?${params}`);
      setInvoices(data.data);
      setTotal(data.pagination.total);
    } catch (e) {
      toast.error('Failed to load invoices', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
    // `toast` is a fresh object each render — intentionally omitted from deps.
  }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100')
      .then(d => setCustomers(d.data))
      .catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));

  const statusOrder: Record<string, number> = { draft: 0, sent: 1, overdue: 2, paid: 3, void: 4 };
  const today = new Date().toISOString().split('T')[0];

  const filteredInvoices = invoices
    .filter(inv => {
      if (!search) return true;
      const q = search.toLowerCase();
      return String(inv.invoiceNumber).includes(q) || (customerMap.get(inv.customerId) ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'due_date': return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'amount': return b.totalCents - a.totalCents;
        case 'status': return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        case 'newest':
        default: return b.invoiceNumber - a.invoiceNumber;
      }
    });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const inv = await api<{ id: string; invoiceNumber: number }>('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: createForm.customerId,
          issueDate: today,
          dueDate: createForm.dueDate,
          notes: createForm.notes || undefined,
        }),
      });
      setShowCreate(false);
      setCreateForm({ customerId: '', dueDate: createForm.dueDate, notes: '' });
      setMessage(`Invoice #${inv.invoiceNumber} created. Click it to add line items.`);
      loadInvoices();
      if (onSelectInvoice) onSelectInvoice(inv.id);
    } catch (e: unknown) {
      setMessage(`Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally { setSaving(false); }
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    const { id, invoiceNumber } = deleteTarget;
    setMessage('');
    try {
      await api(`/invoices/${id}`, { method: 'DELETE' });
      setMessage(`Invoice #${invoiceNumber} deleted.`);
      setDeleteTarget(null);
      loadInvoices();
    } catch (e: unknown) {
      toast.error('Failed to delete invoice', e instanceof Error ? e.message : undefined);
      throw e;
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setMessage('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await api<{ created: number }>('/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ issueDate: today, dueDate: genDueDate }),
      });
      setMessage(`Generated ${result.created} invoice(s). Issue date: ${today}, Due: ${genDueDate}`);
      setShowGenerate(false);
      loadInvoices();
    } catch (e: unknown) {
      setMessage(`Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  }

  const statuses = ['', 'draft', 'sent', 'paid', 'overdue', 'void'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Combobox
              options={[
                {value: 'newest', label: 'Invoice # (newest)'},
                {value: 'due_date', label: 'Due Date'},
                {value: 'amount', label: 'Amount'},
                {value: 'status', label: 'Status'},
              ]}
              value={sort}
              onValueChange={(v) => setSort(v)}
              placeholder="Sort by..."
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowGenerate(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Generate from Contracts</span>
              <span className="sm:hidden">Generate</span>
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              New Invoice
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s || 'All'}
            </Button>
          ))}
        </div>
      </div>

      {message && (
        <div className={`text-sm p-3 rounded-md ${message.startsWith('Failed') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'}`}>
          {message}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Invoices ({total})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium w-20">Invoice #</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Issue Date</th>
                <th className="text-left p-3 font-medium">Due Date</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-right p-3 font-medium hidden md:table-cell">Paid</th>
                <th className="text-right p-3 font-medium">Balance</th>
                <th className="w-10"></th>
              </tr></thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="p-3 hidden md:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="p-3 text-right hidden md:table-cell"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="p-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="p-3"><Skeleton className="h-7 w-7 rounded" /></td>
                    </tr>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <EmptyState
                        icon={Receipt}
                        title="No invoices found"
                        description={search || statusFilter ? 'Try adjusting your search or filters.' : 'Create an invoice or generate them from contracts.'}
                        action={!search && !statusFilter ? { label: 'New Invoice', onClick: () => setShowCreate(true) } : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map(inv => {
                    const isOverdue = inv.status === 'sent' && inv.dueDate < today;
                    return (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium text-primary">
                        {onSelectInvoice ? (
                          <button className="hover:underline" onClick={() => onSelectInvoice(inv.id)}>INV-{inv.invoiceNumber}</button>
                        ) : (
                          <>INV-{inv.invoiceNumber}</>
                        )}
                      </td>
                      <td className="p-3">
                        <button className="text-primary hover:underline" onClick={() => onNavigateToCustomer(inv.customerId)}>
                          {customerMap.get(inv.customerId) ?? '-'}
                        </button>
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariant[inv.status] ?? 'secondary'}>{inv.status}</Badge>
                        {isOverdue && (
                          <Badge variant="destructive" className="ml-1">Overdue</Badge>
                        )}
                      </td>
                      <td className={`p-3 hidden md:table-cell ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>{inv.issueDate}</td>
                      <td className={`p-3 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>{inv.dueDate}</td>
                      <td className="p-3 text-right font-medium">{formatCents(inv.totalCents)}</td>
                      <td className="p-3 text-right text-muted-foreground hidden md:table-cell">{formatCents(inv.amountPaidCents)}</td>
                      <td className="p-3 text-right font-medium">
                        {formatCents(inv.totalCents - inv.amountPaidCents)}
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete invoice INV-${inv.invoiceNumber}`}
                          onClick={() => setDeleteTarget({ id: inv.id, invoiceNumber: inv.invoiceNumber })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {total > 25 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">Page {page} of {Math.ceil(total / 25)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {/* Generate Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoices from Contracts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates draft invoices from all active contracts. Invoices are billed ahead — the service period is the month of the due date.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input type="date" value={new Date().toISOString().split('T')[0]} disabled />
                <p className="text-xs text-muted-foreground">Today's date</p>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={genDueDate} onChange={e => setGenDueDate(e.target.value)} />
              </div>
            </div>
            <div className="bg-muted p-3 rounded-md text-sm">
              <span className="text-muted-foreground">Service period: </span>
              <span className="font-medium">
                {new Date(genDueDate + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                e.g., invoice issued today with due date {genDueDate} covers services for {new Date(genDueDate + 'T00:00:00').toLocaleString('en-US', { month: 'long' })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Generate Invoices'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create One-Off Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a one-off invoice for ad-hoc items (hardware, one-time services, etc.). Add line items after creating.
            </p>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={customers.map(c => ({value: c.id, label: c.name}))}
                value={createForm.customerId}
                onValueChange={(v) => setCreateForm({ ...createForm, customerId: v })}
                placeholder="Select customer..."
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={createForm.dueDate} onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Keyboard and mouse combo, etc." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Invoice"
        description={`Permanently delete invoice INV-${deleteTarget?.invoiceNumber}? This will remove all line items and cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={executeDelete}
      />
    </div>
  );
}
