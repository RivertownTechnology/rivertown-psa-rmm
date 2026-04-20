import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Quote {
  id: string;
  quoteNumber: number;
  title: string;
  customerId: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  validUntil: string | null;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
}

interface PaginatedResponse {
  data: Quote[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'default',
  approved: 'secondary',
  rejected: 'destructive',
  converted: 'secondary',
};

export function QuotesPage({ onNavigateToCustomer, onSelectQuote }: { onNavigateToCustomer: (id: string) => void; onSelectQuote?: (id: string) => void }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest_number');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    title: '',
    summary: '',
    validUntil: '',
  });
  const [confirmState, setConfirmState] = useState<{open: boolean; id?: string; quoteNumber?: number}>({open: false});

  const loadQuotes = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (statusFilter) params.set('status', statusFilter);
    const data = await api<PaginatedResponse>(`/quotes?${params}`);
    setQuotes(data.data);
    setTotal(data.pagination.total);
  }, [page, statusFilter]);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100')
      .then(d => setCustomers(d.data))
      .catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));

  const filteredQuotes = quotes
    .filter(q => {
      if (!search) return true;
      const s = search.toLowerCase();
      return String(q.quoteNumber).includes(s) || q.title.toLowerCase().includes(s) || (customerMap.get(q.customerId) ?? '').toLowerCase().includes(s);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'newest_date': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'total': return b.totalCents - a.totalCents;
        case 'newest_number':
        default: return b.quoteNumber - a.quoteNumber;
      }
    });

  function handleDelete(id: string, quoteNumber: number) {
    setConfirmState({open: true, id, quoteNumber});
  }

  async function executeDelete() {
    if (!confirmState.id) return;
    try {
      await api(`/quotes/${confirmState.id}`, { method: 'DELETE' });
      loadQuotes();
    } catch { /* */ }
    setConfirmState({open: false});
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        customerId: form.customerId,
        title: form.title,
      };
      if (form.summary) payload.summary = form.summary;
      if (form.validUntil) payload.validUntil = form.validUntil;
      await api('/quotes', { method: 'POST', body: JSON.stringify(payload) });
      setShowCreate(false);
      setForm({ customerId: '', title: '', summary: '', validUntil: '' });
      loadQuotes();
    } finally {
      setSaving(false);
    }
  }

  const statuses = ['', 'draft', 'sent', 'approved', 'rejected', 'converted'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search quotes..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Combobox
              options={[
                {value: 'newest_number', label: 'Quote # (newest)'},
                {value: 'newest_date', label: 'Created (newest)'},
                {value: 'total', label: 'Total'},
              ]}
              value={sort}
              onValueChange={(v) => setSort(v)}
              placeholder="Sort by..."
              className="w-44"
            />
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />New Quote
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {statuses.map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s || 'All'}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Quotes ({total})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium w-20">Quote #</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Total</th>
                <th className="text-left p-3 font-medium">Valid Until</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="w-10"></th>
              </tr></thead>
              <tbody>
                {filteredQuotes.map(q => (
                  <tr key={q.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectQuote?.(q.id)}>
                    <td className="p-3 font-medium text-primary hover:underline">Q-{q.quoteNumber}</td>
                    <td className="p-3 font-medium">{q.title}</td>
                    <td className="p-3">
                      <button className="text-primary hover:underline" onClick={() => onNavigateToCustomer(q.customerId)}>
                        {customerMap.get(q.customerId) ?? '-'}
                      </button>
                    </td>
                    <td className="p-3">
                      <Badge variant={statusVariant[q.status] ?? 'secondary'}>{q.status}</Badge>
                    </td>
                    <td className="p-3 text-right font-medium">{formatCents(q.totalCents)}</td>
                    <td className="p-3 text-muted-foreground">{q.validUntil ?? '-'}</td>
                    <td className="p-3 text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(q.id, q.quoteNumber)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredQuotes.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No quotes</td></tr>
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={customers.map(c => ({value: c.id, label: c.name}))}
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v })}
                placeholder="Select customer..."
              />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Managed Services Proposal" />
            </div>
            <div className="space-y-2">
              <Label>Summary</Label>
              <textarea
                rows={3}
                value={form.summary}
                onChange={e => setForm({ ...form, summary: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional description..."
              />
            </div>
            <div className="space-y-2">
              <Label>Valid Until</Label>
              <Input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Quote'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState(s => ({...s, open}))}
        title="Delete Quote"
        description={`Delete quote Q-${confirmState.quoteNumber}? This will remove all line items.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={executeDelete}
      />
    </div>
  );
}
