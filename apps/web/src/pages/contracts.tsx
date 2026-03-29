import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Trash2 } from 'lucide-react';

interface Contract {
  id: string; name: string; contractType: string; status: string;
  customerId: string; startDate: string; endDate: string | null;
  billingCycle: string; createdAt: string;
}
interface Customer { id: string; name: string; }
interface PaginatedResponse { data: Contract[]; pagination: { total: number; page: number; totalPages: number }; }

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', draft: 'outline', expired: 'secondary', cancelled: 'destructive',
};

const typeLabels: Record<string, string> = {
  managed_services: 'Managed Services', break_fix: 'Break/Fix',
  per_device: 'Per Device', per_user: 'Per User', block_time: 'Block Time',
  recurring_flat: 'Flat Rate', ad_hoc: 'Ad-Hoc',
};

export function ContractsPage({ onNavigateToCustomer, onSelectContract }: { onNavigateToCustomer: (id: string) => void; onSelectContract?: (id: string) => void }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '', name: '', contractType: 'managed_services', status: 'draft',
    startDate: new Date().toISOString().split('T')[0], billingCycle: 'monthly',
  });

  const loadContracts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (statusFilter) params.set('status', statusFilter);
    const data = await api<PaginatedResponse>(`/contracts?${params}`);
    setContracts(data.data);
    setTotal(data.pagination.total);
  }, [page, statusFilter]);

  useEffect(() => { loadContracts(); }, [loadContracts]);

  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100')
      .then(d => setCustomers(d.data))
      .catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));

  const statusOrder: Record<string, number> = { active: 0, draft: 1, expired: 2, cancelled: 3 };

  const filteredContracts = contracts
    .filter(c => {
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete contract "${name}"? This will remove all line items.`)) return;
    try {
      await api(`/contracts/${id}`, { method: 'DELETE' });
      loadContracts();
    } catch { /* */ }
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

  const statuses = ['', 'draft', 'active', 'expired', 'cancelled'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contracts..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="newest">Created (newest)</option>
              <option value="name_az">Name A-Z</option>
              <option value="status">Status</option>
            </select>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />New Contract</Button>
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
        <CardHeader className="pb-3"><CardTitle className="text-base">Contracts ({total})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Customer</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Billing</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Start</th>
              <th className="text-left p-3 font-medium">End</th>
              <th className="w-10"></th>
            </tr></thead>
            <tbody>
              {filteredContracts.map(c => (
                <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectContract?.(c.id)}>
                  <td className="p-3 font-medium text-primary hover:underline">{c.name}</td>
                  <td className="p-3">
                    <button className="text-primary hover:underline" onClick={() => onNavigateToCustomer(c.customerId)}>
                      {customerMap.get(c.customerId) ?? '-'}
                    </button>
                  </td>
                  <td className="p-3"><Badge variant="outline">{typeLabels[c.contractType] ?? c.contractType}</Badge></td>
                  <td className="p-3 text-muted-foreground capitalize">{c.billingCycle}</td>
                  <td className="p-3"><Badge variant={statusVariant[c.status] ?? 'secondary'}>{c.status}</Badge></td>
                  <td className="p-3 text-muted-foreground">{c.startDate}</td>
                  <td className="p-3 text-muted-foreground">{c.endDate ?? 'Ongoing'}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id, c.name)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredContracts.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No contracts</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <select required value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>Contract Name</Label>
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Managed Services - Acme Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type</Label>
                <select value={form.contractType} onChange={e => setForm({ ...form, contractType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="managed_services">Managed Services</option>
                  <option value="break_fix">Break/Fix</option>
                  <option value="per_device">Per Device</option>
                  <option value="per_user">Per User</option>
                  <option value="block_time">Block Time</option>
                  <option value="recurring_flat">Flat Rate</option>
                  <option value="ad_hoc">Ad-Hoc</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Billing Cycle</Label>
                <select value={form.billingCycle} onChange={e => setForm({ ...form, billingCycle: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div className="space-y-2"><Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
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
