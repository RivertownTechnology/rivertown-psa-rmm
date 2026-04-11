import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Search } from 'lucide-react';

interface Ticket {
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
}

interface Customer {
  id: string;
  name: string;
}

interface Contract { id: string; name: string; contractType: string; status: string; customerId: string; }

interface PaginatedResponse {
  data: Ticket[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const priorityColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'secondary',
  medium: 'outline',
  high: 'default',
  critical: 'destructive',
};

const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  open: 'default',
  pending: 'outline',
  waiting_on_customer: 'secondary',
  resolved: 'secondary',
  closed: 'secondary',
};

function getSlaStatus(ticket: Ticket): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (ticket.slaBreached) return { label: 'Breached', variant: 'destructive' };
  if (!ticket.slaResolutionDueAt) return { label: 'No SLA', variant: 'outline' };
  if (['resolved', 'closed'].includes(ticket.status)) return { label: 'Met', variant: 'secondary' };
  const now = Date.now();
  const due = new Date(ticket.slaResolutionDueAt).getTime();
  const remaining = due - now;
  const total = due - new Date(ticket.createdAt).getTime();
  if (remaining <= 0) return { label: 'Breached', variant: 'destructive' };
  if (remaining < total * 0.25) return { label: 'At Risk', variant: 'default' };
  return { label: 'On Track', variant: 'secondary' };
}

export function TicketsPage({ onSelectTicket }: { onSelectTicket?: (id: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [formData, setFormData] = useState({ customerId: '', subject: '', description: '', priority: 'medium', contractId: '', categoryId: '', subcategoryId: '' });
  const [categories, setCategories] = useState<Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }>>([]);

  const fetchTickets = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (statusFilter.length > 0) params.set('status', statusFilter.join(','));
    const data = await api<PaginatedResponse>(`/tickets?${params}`);
    setTickets(data.data);
    setTotal(data.pagination.total);
  }, [page, statusFilter]);

  const fetchCustomers = useCallback(async () => {
    const data = await api<{ data: Customer[] }>('/customers?limit=100');
    setCustomers(data.data);
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchCustomers();
    api<Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }>>('/ticket-categories').then(setCategories).catch(() => {});
  }, [fetchTickets, fetchCustomers]);

  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const filteredTickets = tickets
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return t.subject.toLowerCase().includes(q) || String(t.ticketNumber).includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'priority': return (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
        case 'number': return b.ticketNumber - a.ticketNumber;
        case 'newest':
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // When customer changes in form, load their contracts
  async function onFormCustomerChange(custId: string) {
    setFormData(f => ({ ...f, customerId: custId, contractId: '' }));
    if (custId) {
      const data = await api<{ data: Contract[] }>(`/contracts?customerId=${custId}&status=active&limit=100`);
      setContracts(data.data);
    } else {
      setContracts([]);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!payload.contractId) delete payload.contractId;
      if (!payload.categoryId) delete payload.categoryId;
      if (!payload.subcategoryId) delete payload.subcategoryId;
      await api('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      setFormData({ customerId: '', subject: '', description: '', priority: 'medium', contractId: '', categoryId: '', subcategoryId: '' });
      setContracts([]);
      fetchTickets();
    } finally {
      setSaving(false);
    }
  }

  const statuses = ['', 'new', 'open', 'pending', 'waiting_on_customer', 'resolved', 'closed'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
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
              <option value="oldest">Created (oldest)</option>
              <option value="priority">Priority (high first)</option>
              <option value="number">Ticket #</option>
            </select>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={statusFilter.length === 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStatusFilter([]); setPage(1); }}
          >
            All
          </Button>
          {statuses.filter(Boolean).map((s) => (
            <Button
              key={s}
              variant={statusFilter.includes(s) ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(prev =>
                  prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                );
                setPage(1);
              }}
            >
              {s === 'waiting_on_customer' ? 'Waiting' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tickets ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium w-16">#</th>
                  <th className="text-left p-3 font-medium">Subject</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Priority</th>
                  <th className="text-left p-3 font-medium">SLA</th>
                  <th className="text-left p-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectTicket?.(t.id)}>
                    <td className="p-3 text-muted-foreground">{t.ticketNumber}</td>
                    <td className="p-3 font-medium text-primary hover:underline">{t.subject}</td>
                    <td className="p-3 text-muted-foreground">{customerMap.get(t.customerId) ?? '-'}</td>
                    <td className="p-3">
                      <Badge variant={statusColor[t.status] ?? 'secondary'}>
                        {t.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={priorityColor[t.priority] ?? 'outline'}>
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {(() => {
                        const sla = getSlaStatus(t);
                        const cls = sla.label === 'At Risk' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : sla.label === 'Met' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : '';
                        return <Badge variant={sla.variant} className={cls}>{sla.label}</Badge>;
                      })()}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No tickets found
                    </td>
                  </tr>
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
          <DialogHeader>
            <DialogTitle>New Ticket</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer</Label>
              <select
                id="customerId"
                required
                value={formData.customerId}
                onChange={(e) => onFormCustomerChange(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {contracts.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="contractId">Contract</Label>
                <select
                  id="contractId"
                  value={formData.contractId}
                  onChange={(e) => setFormData({ ...formData, contractId: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No contract (billable)</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.contractType.replace(/_/g, ' ')})</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {formData.contractId ? 'Work covered under contract' : 'Time logged will be billable'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" required value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
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
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, subcategoryId: '' })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subcategoryId">Subcategory</Label>
                <select
                  id="subcategoryId"
                  value={formData.subcategoryId}
                  disabled={!formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{formData.categoryId ? 'Select subcategory' : 'Select category first'}</option>
                  {categories.find(c => c.id === formData.categoryId)?.subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Ticket'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
