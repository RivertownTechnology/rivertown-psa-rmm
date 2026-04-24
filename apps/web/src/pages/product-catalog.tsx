import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Package, Search, Copy } from 'lucide-react';

interface CatalogItem {
  id: string; name: string; description: string | null; sku: string | null;
  vendor: string | null; category: string; itemType: string;
  defaultUnitCostCents: number | null; defaultUnitPriceCents: number;
  pax8ProductName: string | null; pax8ProductId: string | null; pax8VendorName: string | null;
  qboItemId: string | null; qboIncomeAccountId: string | null; qboCogAccountId: string | null;
  taxable: boolean; isActive: boolean;
}

interface QBOAccount { id: string; name: string; type: string; }

const categoryLabels: Record<string, string> = {
  license: 'License', rmm: 'RMM', edr_av: 'EDR/AV', backup: 'Backup',
  managed_service: 'Managed Service', support_hours: 'Support Hours', hardware: 'Hardware', other: 'Other',
};

const emptyForm = {
  name: '', description: '', sku: '', vendor: '', category: 'license', itemType: 'recurring',
  defaultUnitCostCents: '', defaultUnitPriceCents: '', taxable: true,
  pax8ProductName: '', pax8ProductId: '', pax8VendorName: '',
  qboIncomeAccountId: '', qboCogAccountId: '',
};

export function ProductCatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [qboAccounts, setQboAccounts] = useState<QBOAccount[]>([]);
  const [qboConnected, setQboConnected] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set('category', categoryFilter);
    const data = await api<CatalogItem[]>(`/service-catalog?${params}`);
    setItems(data);
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  // Load QBO accounts if connected
  useEffect(() => {
    api<{ connected: boolean }>('/settings/quickbooks/status')
      .then(s => {
        setQboConnected(s.connected);
        if (s.connected) {
          api<QBOAccount[]>('/integrations/quickbooks/accounts').then(setQboAccounts).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const filtered = items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return i.name.toLowerCase().includes(s) || (i.sku?.toLowerCase().includes(s)) ||
      (i.vendor?.toLowerCase().includes(s)) || (i.description?.toLowerCase().includes(s));
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(item: CatalogItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      sku: item.sku ?? '',
      vendor: item.vendor ?? '',
      category: item.category,
      itemType: item.itemType,
      defaultUnitCostCents: item.defaultUnitCostCents ? (item.defaultUnitCostCents / 100).toString() : '',
      defaultUnitPriceCents: (item.defaultUnitPriceCents / 100).toString(),
      taxable: item.taxable ?? true,
      pax8ProductName: item.pax8ProductName ?? '',
      pax8ProductId: item.pax8ProductId ?? '',
      pax8VendorName: item.pax8VendorName ?? '',
      qboIncomeAccountId: item.qboIncomeAccountId ?? '',
      qboCogAccountId: item.qboCogAccountId ?? '',
    });
    setShowForm(true);
  }

  function cloneItem(item: CatalogItem) {
    setEditingId(null); // Creates a new item, not editing
    setForm({
      name: `${item.name} (Copy)`,
      description: item.description ?? '',
      sku: item.sku ? `${item.sku}-COPY` : '',
      vendor: item.vendor ?? '',
      category: item.category,
      itemType: item.itemType,
      defaultUnitCostCents: item.defaultUnitCostCents ? (item.defaultUnitCostCents / 100).toString() : '',
      defaultUnitPriceCents: (item.defaultUnitPriceCents / 100).toString(),
      taxable: item.taxable ?? true,
      pax8ProductName: '',
      pax8ProductId: '',
      pax8VendorName: '',
      qboIncomeAccountId: item.qboIncomeAccountId ?? '',
      qboCogAccountId: item.qboCogAccountId ?? '',
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        sku: form.sku || undefined,
        vendor: form.vendor || undefined,
        category: form.category,
        itemType: form.itemType,
        defaultUnitCostCents: form.defaultUnitCostCents ? Math.round(parseFloat(form.defaultUnitCostCents) * 100) : undefined,
        defaultUnitPriceCents: Math.round(parseFloat(form.defaultUnitPriceCents) * 100),
        taxable: form.taxable,
        pax8ProductName: form.pax8ProductName || undefined,
        pax8ProductId: form.pax8ProductId || undefined,
        pax8VendorName: form.pax8VendorName || undefined,
        qboIncomeAccountId: form.qboIncomeAccountId || undefined,
        qboCogAccountId: form.qboCogAccountId || undefined,
      };

      if (editingId) {
        await api(`/service-catalog/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/service-catalog', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from catalog?`)) return;
    await api(`/service-catalog/${id}`, { method: 'DELETE' });
    load();
  }

  function margin(cost: number | null, price: number): string {
    if (!cost || price === 0) return '-';
    return `${(((price - cost) / price) * 100).toFixed(1)}%`;
  }

  const categories = ['', 'license', 'rmm', 'edr_av', 'backup', 'managed_service', 'support_hours', 'hardware', 'other'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All Categories</option>
            {categories.filter(Boolean).map(c => <option key={c} value={c}>{categoryLabels[c] ?? c}</option>)}
          </select>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Product Catalog ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-left p-3 font-medium">Vendor</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-right p-3 font-medium">Cost</th>
                  <th className="text-right p-3 font-medium">Price</th>
                  <th className="text-right p-3 font-medium">Margin</th>
                  <th className="text-left p-3 font-medium">Pax8</th>
                  <th className="text-center p-3 font-medium">QB</th>
                  <th className="text-center p-3 font-medium">Tax</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{item.name}</div>
                      {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">{item.sku ?? '-'}</td>
                    <td className="p-3 text-muted-foreground">{item.vendor ?? '-'}</td>
                    <td className="p-3"><Badge variant="outline">{categoryLabels[item.category] ?? item.category}</Badge></td>
                    <td className="p-3 text-right text-muted-foreground">{formatCents(item.defaultUnitCostCents)}</td>
                    <td className="p-3 text-right font-medium">{formatCents(item.defaultUnitPriceCents)}</td>
                    <td className="p-3 text-right">
                      {(() => {
                        const m = margin(item.defaultUnitCostCents, item.defaultUnitPriceCents);
                        if (m === '-') return '-';
                        const pct = parseFloat(m);
                        return <span className={pct >= 50 ? 'text-green-600' : pct >= 20 ? 'text-yellow-600' : 'text-red-500'}>{m}</span>;
                      })()}
                    </td>
                    <td className="p-3">
                      {item.pax8ProductName ? (
                        <Badge variant="secondary" className="text-xs">{item.pax8ProductName}</Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-3 text-center">
                      {item.qboItemId ? (
                        <Badge variant="secondary" className="text-xs text-green-600">Synced</Badge>
                      ) : item.qboIncomeAccountId ? (
                        <Badge variant="outline" className="text-xs">Mapped</Badge>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-3 text-center">
                      {item.taxable ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Tax</Badge> : <span className="text-xs text-muted-foreground">No</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Clone" onClick={() => cloneItem(item)}><Copy className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id, item.name)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">
                    {items.length === 0 ? 'No products in catalog yet' : 'No products match your search'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Product' : 'Add Product'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Microsoft 365 Business Premium" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Per-user cloud productivity suite" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="M365-BP" />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Microsoft" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {categories.filter(Boolean).map(c => <option key={c} value={c}>{categoryLabels[c] ?? c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Billing Type</Label>
                <select value={form.itemType} onChange={e => setForm({ ...form, itemType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="recurring">Recurring</option>
                  <option value="per_device">Per Device</option>
                  <option value="per_user">Per User</option>
                  <option value="one_time">One Time</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" min="0" value={form.defaultUnitCostCents} onChange={e => setForm({ ...form, defaultUnitCostCents: e.target.value })} placeholder="12.00" />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input type="number" step="0.01" min="0" required value={form.defaultUnitPriceCents} onChange={e => setForm({ ...form, defaultUnitPriceCents: e.target.value })} placeholder="15.00" />
              </div>
            </div>
            {form.defaultUnitCostCents && form.defaultUnitPriceCents && (
              <div className="bg-muted p-3 rounded-md text-sm flex justify-between">
                <span>Margin:</span>
                <span className="font-medium">
                  {((1 - parseFloat(form.defaultUnitCostCents) / parseFloat(form.defaultUnitPriceCents)) * 100).toFixed(1)}%
                  {' '}(${(parseFloat(form.defaultUnitPriceCents) - parseFloat(form.defaultUnitCostCents)).toFixed(2)} profit/unit)
                </span>
              </div>
            )}

            {/* Tax */}
            <div className="flex items-center gap-3 py-2">
              <input type="checkbox" id="taxable" checked={form.taxable} onChange={e => setForm({ ...form, taxable: e.target.checked })} className="h-4 w-4" />
              <Label htmlFor="taxable">Taxable</Label>
              <span className="text-xs text-muted-foreground">Uncheck for non-taxable items (e.g., labor/services in most states)</span>
            </div>

            {/* Pax8 sync fields */}
            <div className="border-t pt-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pax8 Mapping</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Pax8 Product Name</Label>
                  <Input value={form.pax8ProductName} onChange={e => setForm({ ...form, pax8ProductName: e.target.value })} placeholder="Microsoft 365 Business Premium" />
                </div>
                <div className="space-y-2">
                  <Label>Pax8 Product ID</Label>
                  <Input value={form.pax8ProductId} onChange={e => setForm({ ...form, pax8ProductId: e.target.value })} placeholder="pax8-product-uuid" />
                </div>
              </div>
              <div className="space-y-2 mt-3">
                <Label>Pax8 Vendor</Label>
                <Input value={form.pax8VendorName} onChange={e => setForm({ ...form, pax8VendorName: e.target.value })} placeholder="Microsoft" />
              </div>
            </div>

            {/* QuickBooks Mapping */}
            {qboConnected && (
              <div className="border-t pt-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">QuickBooks Mapping</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Income Account (Revenue)</Label>
                    <select value={form.qboIncomeAccountId} onChange={e => setForm({ ...form, qboIncomeAccountId: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Not mapped</option>
                      {qboAccounts.filter(a => a.type === 'Income' || a.type === 'Other Income').map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>COGS Account (Cost)</Label>
                    <select value={form.qboCogAccountId} onChange={e => setForm({ ...form, qboCogAccountId: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Not mapped</option>
                      {qboAccounts.filter(a => a.type === 'Cost of Goods Sold' || a.type === 'Expense').map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Map this item to QBO accounts. Revenue goes to the income account, cost goes to the COGS account. The item will auto-sync to QuickBooks when an invoice is sent.</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Product'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
