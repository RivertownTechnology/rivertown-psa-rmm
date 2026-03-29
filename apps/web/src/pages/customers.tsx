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
import { Plus, Search, Trash2 } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  status: string;
  billingEmail: string | null;
  phone: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  data: Customer[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function CustomersPage({ onSelectCustomer }: { onSelectCustomer?: (id: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name_az');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '', website: '' });
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (search) params.set('search', search);
    const data = await api<PaginatedResponse>(`/customers?${params}`);
    setCustomers(data.data);
    setTotal(data.pagination.total);
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function handleDelete(id: string, name: string) {
    // Fetch related data counts
    try {
      const [tickets, contacts, contracts, invoices] = await Promise.all([
        api<{ pagination: { total: number } }>(`/tickets?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/contacts?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/contracts?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/invoices?customerId=${id}&limit=1`),
      ]);
      const total = tickets.pagination.total + contacts.pagination.total + contracts.pagination.total + invoices.pagination.total;
      const msg = total > 0
        ? `Delete "${name}"? This customer has ${tickets.pagination.total} tickets, ${contacts.pagination.total} contacts, ${contracts.pagination.total} contracts, and ${invoices.pagination.total} invoices. This cannot be undone.`
        : `Delete "${name}"? This cannot be undone.`;
      if (!confirm(msg)) return;
    } catch {
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    }
    try {
      await api(`/customers/${id}`, { method: 'DELETE' });
      fetchCustomers();
    } catch { /* FK constraint may prevent */ }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          billingEmail: formData.billingEmail || undefined,
          ccBillingEmail: formData.ccBillingEmail || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          zip: formData.zip || undefined,
          website: formData.website || undefined,
        }),
      });
      setShowCreate(false);
      setFormData({ name: '', billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '', website: '' });
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  const sortedCustomers = [...customers].sort((a, b) => {
    switch (sort) {
      case 'name_za': return b.name.localeCompare(a.name);
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'name_az':
      default: return a.name.localeCompare(b.name);
    }
  });

  const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    inactive: 'secondary',
    prospect: 'outline',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active Client',
    inactive: 'Former Client',
    prospect: 'Prospective Client',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
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
            <option value="name_az">Name A-Z</option>
            <option value="name_za">Name Z-A</option>
            <option value="newest">Created (newest)</option>
          </select>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customers ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectCustomer?.(c.id)}>
                    <td className="p-3 font-medium text-primary hover:underline">{c.name}</td>
                    <td className="p-3">
                      <Badge variant={statusColor[c.status] ?? 'secondary'}>{statusLabels[c.status] ?? c.status}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.billingEmail ?? '-'}</td>
                    <td className="p-3 text-muted-foreground">{c.phone ?? '-'}</td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id, c.name)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No customers found
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input id="billingEmail" type="email" value={formData.billingEmail} onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ccBillingEmail">CC Billing Email</Label>
                <Input id="ccBillingEmail" type="email" value={formData.ccBillingEmail} onChange={(e) => setFormData({ ...formData, ccBillingEmail: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">Zip</Label>
                <Input id="zip" value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
