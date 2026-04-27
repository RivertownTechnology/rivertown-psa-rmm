import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Trash2, Users } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  status: string;
  billingEmail: string | null;
  phone: string | null;
  createdAt: string;
  openTicketCount?: number;
}

interface PaginatedResponse {
  data: Customer[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  prospect: 'outline',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
};

const sortOptions = [
  { value: 'name_az', label: 'Name A-Z' },
  { value: 'name_za', label: 'Name Z-A' },
  { value: 'newest', label: 'Created (newest)' },
];

export function CustomersPage({ onSelectCustomer }: { onSelectCustomer?: (id: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name_az');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '', website: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      const data = await api<PaginatedResponse>(`/customers?${params}`);
      setCustomers(data.data);
      setTotal(data.pagination.total);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function initiateDelete(id: string, name: string) {
    // Fetch related data counts for the confirmation message
    let description = `Delete "${name}"? This cannot be undone.`;
    try {
      const [tickets, contacts, contracts, invoices] = await Promise.all([
        api<{ pagination: { total: number } }>(`/tickets?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/contacts?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/contracts?customerId=${id}&limit=1`),
        api<{ pagination: { total: number } }>(`/invoices?customerId=${id}&limit=1`),
      ]);
      const relatedTotal = tickets.pagination.total + contacts.pagination.total + contracts.pagination.total + invoices.pagination.total;
      if (relatedTotal > 0) {
        description = `Delete "${name}"? This customer has ${tickets.pagination.total} tickets, ${contacts.pagination.total} contacts, ${contracts.pagination.total} contracts, and ${invoices.pagination.total} invoices. This cannot be undone.`;
      }
    } catch {
      // Use default message
    }
    setDeleteTarget({ id, name, description });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/customers/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      fetchCustomers();
    } catch {
      // FK constraint may prevent
    } finally {
      setDeleting(false);
    }
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

  return (
    <div className="space-y-4">
      {/* Header */}
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
          <Combobox
            options={sortOptions}
            value={sort}
            onValueChange={setSort}
            placeholder="Sort by..."
            className="w-44"
          />
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Customer Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-40" />
            </CardContent></Card>
          ))}
        </div>
      ) : sortedCustomers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description={search ? "Try adjusting your search terms." : "Add your first customer to get started."}
          action={!search ? { label: 'Add Customer', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {sortedCustomers.map((c) => (
            <Card
              key={c.id}
              className="hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onSelectCustomer?.(c.id)}
            >
              <CardContent className="p-4">
                {/* Line 1: Name + Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    {(c.openTicketCount ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        {c.openTicketCount} open
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColor[c.status] ?? 'secondary'}>
                      {statusLabels[c.status] ?? c.status}
                    </Badge>
                    <div onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => initiateDelete(c.id, c.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Line 2: Email + Phone */}
                <div className="flex items-center gap-4 mt-1.5">
                  {c.billingEmail && (
                    <span className="text-sm text-muted-foreground">{c.billingEmail}</span>
                  )}
                  {c.phone && (
                    <span className="text-sm text-muted-foreground">{c.phone}</span>
                  )}
                  {!c.billingEmail && !c.phone && (
                    <span className="text-sm text-muted-foreground italic">No contact info</span>
                  )}
                </div>

                {/* Line 3: Health summary placeholder */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground">
                    Added {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Customer"
        description={deleteTarget?.description ?? ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Create Dialog */}
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
