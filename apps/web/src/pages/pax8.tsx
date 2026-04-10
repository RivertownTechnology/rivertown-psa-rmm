import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ArrowLeft, RefreshCw, Link2, Unlink, Download, Search, Package, Building, FileText } from 'lucide-react';

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '-';
  return '$' + (cents / 100).toFixed(2);
}

// ── Types ─────────────────────────────────────────────────────────────

interface Pax8Company {
  id: string;
  name: string;
  status?: string;
  mapped: boolean;
  customerId: string | null;
  customerName: string | null;
}

interface Pax8Product {
  id: string;
  name: string;
  vendorName?: string;
  sku?: string;
  inCatalog: boolean;
}

interface Pax8Sub {
  id: string;
  pax8SubscriptionId: string;
  pax8CompanyId: string;
  productName: string;
  quantity: string | null;
  unitPriceCents: string | null;
  billingTerm: string | null;
  startDate: string | null;
  status: string | null;
  contractLineItemId: string | null;
  linkedContract: { contractId: string; contractName: string } | null;
  sellPriceCents: number | null;
}

interface LocalCustomer {
  id: string;
  name: string;
}

interface LocalContract {
  id: string;
  name: string;
  status: string;
}

interface PageInfo {
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ── Page Component ────────────────────────────────────────────────────

export function Pax8Page({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('companies');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Pax8 Integration</h1>
          <p className="text-sm text-muted-foreground">Manage customer mappings, import products, and sync subscriptions</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="companies"><Building className="h-4 w-4 mr-1" />Companies</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Products</TabsTrigger>
        </TabsList>

        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Companies Tab ─────────────────────────────────────────────────────

function CompaniesTab() {
  const [companies, setCompanies] = useState<Pax8Company[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Mapping dialog
  const [mapDialog, setMapDialog] = useState<Pax8Company | null>(null);
  const [localCustomers, setLocalCustomers] = useState<LocalCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [mapping, setMapping] = useState(false);

  // Subscriptions dialog
  const [subsDialog, setSubsDialog] = useState<Pax8Company | null>(null);
  const [subscriptions, setSubscriptions] = useState<Pax8Sub[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [contracts, setContracts] = useState<LocalContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  // Qty management
  const [editQtySub, setEditQtySub] = useState<Pax8Sub | null>(null);
  const [newQty, setNewQty] = useState('');
  const [qtyUpdating, setQtyUpdating] = useState(false);
  const [qtyResult, setQtyResult] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const loadCompanies = useCallback(async (pageNum = 0) => {
    setLoading(true); setError('');
    try {
      const data = await api<{ companies: Pax8Company[]; page: PageInfo }>(`/pax8/companies?page=${pageNum}&size=50`);
      setCompanies(data.companies);
      setPage(data.page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load companies');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  async function openMapDialog(company: Pax8Company) {
    setMapDialog(company);
    setSelectedCustomerId('');
    setCustomerSearch('');
    const data = await api<{ data: LocalCustomer[] }>('/customers?limit=100');
    setLocalCustomers(data.data);
  }

  async function mapCompany() {
    if (!mapDialog || !selectedCustomerId) return;
    setMapping(true);
    try {
      await api(`/pax8/companies/${mapDialog.id}/map`, { method: 'POST', body: JSON.stringify({ customerId: selectedCustomerId }) });
      setMapDialog(null);
      loadCompanies(page?.number ?? 0);
    } finally { setMapping(false); }
  }

  async function unmapCompany(companyId: string) {
    await api(`/pax8/companies/${companyId}/unmap`, { method: 'POST' });
    loadCompanies(page?.number ?? 0);
  }

  async function openSubsDialog(company: Pax8Company) {
    setSubsDialog(company);
    setSubscriptions([]);
    setSelectedSubs(new Set());
    setSelectedContractId('');
    setImportResult('');
    setSubsLoading(true);
    try {
      const [subData, contractData] = await Promise.all([
        api<{ subscriptions: Pax8Sub[]; customer: LocalCustomer | null }>(`/pax8/companies/${company.id}/subscriptions`),
        company.customerId ? api<{ data: LocalContract[] }>(`/contracts?customerId=${company.customerId}`) : Promise.resolve({ data: [] as LocalContract[] }),
      ]);
      setSubscriptions(subData.subscriptions);
      setContracts(contractData.data);
    } finally { setSubsLoading(false); }
  }

  function toggleSub(subId: string) {
    setSelectedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId); else next.add(subId);
      return next;
    });
  }

  function selectAllUnlinked() {
    const unlinked = subscriptions.filter(s => !s.contractLineItemId).map(s => s.pax8SubscriptionId);
    setSelectedSubs(new Set(unlinked));
  }

  async function importToContract() {
    if (!subsDialog || !selectedContractId || selectedSubs.size === 0) return;
    setImporting(true); setImportResult('');
    try {
      const res = await api<{ imported: number; catalogCreated: string[]; skipped: string[] }>(`/pax8/companies/${subsDialog.id}/import-to-contract`, {
        method: 'POST',
        body: JSON.stringify({ contractId: selectedContractId, subscriptionIds: Array.from(selectedSubs) }),
      });
      let msg = `Imported ${res.imported} subscription(s) as contract line items`;
      if (res.catalogCreated?.length) msg += ` | ${res.catalogCreated.length} catalog item(s) created`;
      if (res.skipped?.length) msg += ` | Skipped: ${res.skipped.join(', ')}`;
      setImportResult(msg);
      // Refresh
      const subData = await api<{ subscriptions: Pax8Sub[] }>(`/pax8/companies/${subsDialog.id}/subscriptions`);
      setSubscriptions(subData.subscriptions);
      setSelectedSubs(new Set());
    } catch (e: unknown) {
      setImportResult(e instanceof Error ? e.message : 'Import failed');
    } finally { setImporting(false); }
  }

  async function updateQuantity() {
    if (!editQtySub) return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 0) { setQtyResult('Enter a valid quantity'); return; }
    setQtyUpdating(true); setQtyResult('');
    try {
      const res = await api<{ oldQuantity: number; newQuantity: number }>(`/pax8/subscriptions/${editQtySub.pax8SubscriptionId}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty }),
      });
      setQtyResult(`Updated: ${res.oldQuantity} → ${res.newQuantity}`);
      // Refresh subscriptions
      if (subsDialog) {
        const subData = await api<{ subscriptions: Pax8Sub[] }>(`/pax8/companies/${subsDialog.id}/subscriptions`);
        setSubscriptions(subData.subscriptions);
      }
      setTimeout(() => { setEditQtySub(null); setQtyResult(''); }, 1500);
    } catch (e: unknown) {
      setQtyResult(e instanceof Error ? e.message : 'Update failed');
    } finally { setQtyUpdating(false); }
  }

  async function cancelSubscription(subId: string) {
    if (!confirm('Are you sure you want to cancel this subscription on Pax8? This cannot be undone.')) return;
    setCancelling(subId);
    try {
      await api(`/pax8/subscriptions/${subId}`, { method: 'DELETE' });
      if (subsDialog) {
        const subData = await api<{ subscriptions: Pax8Sub[] }>(`/pax8/companies/${subsDialog.id}/subscriptions`);
        setSubscriptions(subData.subscriptions);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Cancel failed');
    } finally { setCancelling(null); }
  }

  async function runFullSync() {
    setSyncing(true); setSyncResult('');
    try {
      const res = await api<{ synced: number; companies: number }>('/pax8/sync', { method: 'POST' });
      setSyncResult(`Synced ${res.synced} subscriptions across ${res.companies} companies`);
      loadCompanies(page?.number ?? 0);
    } catch (e: unknown) {
      setSyncResult(e instanceof Error ? e.message : 'Sync failed');
    } finally { setSyncing(false); }
  }

  const filtered = search ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : companies;
  const filteredCustomers = customerSearch ? localCustomers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())) : localCustomers;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 w-64" placeholder="Filter companies..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncResult && <span className="text-sm text-muted-foreground">{syncResult}</span>}
          <Button variant="outline" onClick={runFullSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync All'}
          </Button>
          <Button variant="outline" onClick={() => loadCompanies(page?.number ?? 0)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Pax8 Company</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Mapped Customer</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading Pax8 companies...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No companies found</td></tr>}
              {filtered.map(co => (
                <tr key={co.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{co.name}</td>
                  <td className="p-3">
                    <Badge variant={co.status === 'Active' ? 'default' : 'secondary'}>{co.status || 'Unknown'}</Badge>
                  </td>
                  <td className="p-3">
                    {co.mapped ? (
                      <span className="flex items-center gap-1">
                        <Link2 className="h-3 w-3 text-green-600" />
                        <span className="text-green-700">{co.customerName}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not mapped</span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-1">
                    {co.mapped ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openSubsDialog(co)}>
                          <FileText className="h-3 w-3 mr-1" />Subscriptions
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => unmapCompany(co.id)}>
                          <Unlink className="h-3 w-3 mr-1" />Unmap
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openMapDialog(co)}>
                        <Link2 className="h-3 w-3 mr-1" />Map Customer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {page && page.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page.number + 1} of {page.totalPages} ({page.totalElements} companies)
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page.number === 0} onClick={() => loadCompanies(page.number - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page.number >= page.totalPages - 1} onClick={() => loadCompanies(page.number + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Map Customer Dialog */}
      <Dialog open={!!mapDialog} onOpenChange={() => setMapDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Map "{mapDialog?.name}" to a Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search customers..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {filteredCustomers.map(c => (
                <button
                  key={c.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0 ${selectedCustomerId === c.id ? 'bg-primary/10 font-medium' : ''}`}
                  onClick={() => setSelectedCustomerId(c.id)}
                >
                  {c.name}
                </button>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">No customers found</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapDialog(null)}>Cancel</Button>
            <Button onClick={mapCompany} disabled={!selectedCustomerId || mapping}>
              {mapping ? 'Mapping...' : 'Map Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscriptions Dialog */}
      <Dialog open={!!subsDialog} onOpenChange={() => setSubsDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subscriptions - {subsDialog?.name}</DialogTitle>
          </DialogHeader>

          {subsLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading subscriptions...</div>
          ) : (
            <div className="space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 w-8">
                      <input type="checkbox" onChange={e => e.target.checked ? selectAllUnlinked() : setSelectedSubs(new Set())} />
                    </th>
                    <th className="text-left p-2 font-medium">Product</th>
                    <th className="text-left p-2 font-medium">Qty</th>
                    <th className="text-left p-2 font-medium">Cost (Pax8)</th>
                    <th className="text-left p-2 font-medium">Sell Price</th>
                    <th className="text-left p-2 font-medium">Term</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Linked To</th>
                    <th className="text-right p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No subscriptions found</td></tr>
                  )}
                  {subscriptions.map(sub => (
                    <tr key={sub.id} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        {!sub.contractLineItemId && sub.status === 'Active' && (
                          <input
                            type="checkbox"
                            checked={selectedSubs.has(sub.pax8SubscriptionId)}
                            onChange={() => toggleSub(sub.pax8SubscriptionId)}
                          />
                        )}
                      </td>
                      <td className="p-2 font-medium">{sub.productName}</td>
                      <td className="p-2">{sub.quantity ?? '-'}</td>
                      <td className="p-2">{sub.unitPriceCents ? formatCents(parseInt(sub.unitPriceCents, 10)) : '-'}</td>
                      <td className="p-2">
                        {sub.sellPriceCents != null ? (
                          <span className="text-green-700">{formatCents(sub.sellPriceCents)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Set in catalog</span>
                        )}
                      </td>
                      <td className="p-2">{sub.billingTerm ?? '-'}</td>
                      <td className="p-2">
                        <Badge variant={sub.status === 'Active' ? 'default' : 'secondary'}>{sub.status || '-'}</Badge>
                      </td>
                      <td className="p-2">
                        {sub.linkedContract ? (
                          <span className="text-green-700 text-xs">{sub.linkedContract.contractName}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not imported</span>
                        )}
                      </td>
                      <td className="p-2 text-right space-x-1">
                        {sub.status === 'Active' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setEditQtySub(sub); setNewQty(sub.quantity ?? '0'); setQtyResult(''); }}>
                              Qty
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelSubscription(sub.pax8SubscriptionId)} disabled={cancelling === sub.pax8SubscriptionId}>
                              {cancelling === sub.pax8SubscriptionId ? '...' : 'Cancel'}
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Import controls */}
              {subscriptions.some(s => !s.contractLineItemId) && (
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs font-medium">Import selected into contract:</Label>
                        <select
                          className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background"
                          value={selectedContractId}
                          onChange={e => setSelectedContractId(e.target.value)}
                        >
                          <option value="">Select a contract...</option>
                          {contracts.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                          ))}
                        </select>
                      </div>
                      <Button
                        className="mt-5"
                        onClick={importToContract}
                        disabled={importing || !selectedContractId || selectedSubs.size === 0}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        {importing ? 'Importing...' : `Import ${selectedSubs.size} item(s)`}
                      </Button>
                    </div>
                    {importResult && <p className="text-sm text-green-600">{importResult}</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Quantity Dialog */}
      <Dialog open={!!editQtySub} onOpenChange={() => setEditQtySub(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Quantity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium">{editQtySub?.productName}</p>
            <p className="text-xs text-muted-foreground">Current quantity: {editQtySub?.quantity ?? '0'}</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewQty(String(Math.max(0, parseInt(newQty || '0', 10) - 1)))}>-</Button>
              <Input type="number" className="w-24 text-center" value={newQty} onChange={e => setNewQty(e.target.value)} min={0} />
              <Button size="sm" variant="outline" onClick={() => setNewQty(String(parseInt(newQty || '0', 10) + 1))}>+</Button>
            </div>
            {parseInt(newQty || '0', 10) > parseInt(editQtySub?.quantity ?? '0', 10) && (
              <p className="text-xs text-muted-foreground">Increasing quantity will create a partial month proration on the linked contract.</p>
            )}
            {qtyResult && <p className="text-sm text-green-600">{qtyResult}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditQtySub(null)}>Cancel</Button>
            <Button onClick={updateQuantity} disabled={qtyUpdating || newQty === (editQtySub?.quantity ?? '0')}>
              {qtyUpdating ? 'Updating Pax8...' : 'Update Quantity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────

function ProductsTab() {
  const [products, setProducts] = useState<Pax8Product[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [appliedVendor, setAppliedVendor] = useState('');

  // Import dialog
  const [importDialog, setImportDialog] = useState<Pax8Product | null>(null);
  const [importForm, setImportForm] = useState({ name: '', category: 'license', itemType: 'recurring', defaultUnitPriceCents: '', defaultUnitCostCents: '' });
  const [importSaving, setImportSaving] = useState(false);
  const [importResult, setImportResult] = useState('');

  const loadProducts = useCallback(async (pageNum = 0, vendor?: string) => {
    const v = vendor ?? appliedVendor;
    setLoading(true); setError('');
    try {
      let url = `/pax8/products?page=${pageNum}&size=50`;
      if (v) url += `&vendorName=${encodeURIComponent(v)}`;
      const data = await api<{ products: Pax8Product[]; page: PageInfo }>(url);
      setProducts(data.products);
      setPage(data.page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally { setLoading(false); }
  }, [appliedVendor]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function applyVendorFilter() {
    setAppliedVendor(vendorFilter);
    loadProducts(0, vendorFilter);
  }

  function openImportDialog(product: Pax8Product) {
    setImportDialog(product);
    setImportForm({ name: product.name, category: 'license', itemType: 'recurring', defaultUnitPriceCents: '', defaultUnitCostCents: '' });
    setImportResult('');
  }

  async function importProduct() {
    if (!importDialog) return;
    setImportSaving(true); setImportResult('');
    try {
      const res = await api<{ alreadyExisted: boolean }>(`/pax8/products/${importDialog.id}/import`, {
        method: 'POST',
        body: JSON.stringify({
          name: importForm.name,
          category: importForm.category,
          itemType: importForm.itemType,
          defaultUnitPriceCents: importForm.defaultUnitPriceCents ? parseInt(importForm.defaultUnitPriceCents, 10) : 0,
          defaultUnitCostCents: importForm.defaultUnitCostCents ? parseInt(importForm.defaultUnitCostCents, 10) : 0,
        }),
      });
      if (res.alreadyExisted) {
        setImportResult('Product already exists in catalog');
      } else {
        setImportResult('Product imported to catalog');
        loadProducts(page?.number ?? 0);
      }
    } catch (e: unknown) {
      setImportResult(e instanceof Error ? e.message : 'Import failed');
    } finally { setImportSaving(false); }
  }

  const filtered = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : products;

  const categories = ['license', 'security', 'backup', 'managed_service', 'support_hours', 'hardware', 'other'] as const;
  const itemTypes = ['recurring', 'per_device', 'per_user', 'one_time'] as const;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 w-64" placeholder="Filter products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Input className="w-48" placeholder="Vendor name (press Enter)..." value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyVendorFilter()} />
        {appliedVendor && (
          <Badge variant="secondary" className="cursor-pointer" onClick={() => { setVendorFilter(''); setAppliedVendor(''); loadProducts(0, ''); }}>
            Vendor: {appliedVendor} &times;
          </Badge>
        )}
        <Button variant="outline" onClick={() => loadProducts()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Product Name</th>
                <th className="text-left p-3 font-medium">Vendor</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-left p-3 font-medium">In Catalog</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading Pax8 products...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No products found</td></tr>}
              {filtered.map(p => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.vendorName || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs">{p.sku || '-'}</td>
                  <td className="p-3">
                    {p.inCatalog ? (
                      <Badge variant="default">In Catalog</Badge>
                    ) : (
                      <Badge variant="secondary">Not imported</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {!p.inCatalog && (
                      <Button size="sm" variant="outline" onClick={() => openImportDialog(p)}>
                        <Download className="h-3 w-3 mr-1" />Import
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {page && page.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page.number + 1} of {page.totalPages} ({page.totalElements} products)
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page.number === 0} onClick={() => loadProducts(page.number - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page.number >= page.totalPages - 1} onClick={() => loadProducts(page.number + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Import Product Dialog */}
      <Dialog open={!!importDialog} onOpenChange={() => setImportDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import to Service Catalog</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={importForm.name} onChange={e => setImportForm({ ...importForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={importForm.category} onChange={e => setImportForm({ ...importForm, category: e.target.value })}>
                  {categories.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={importForm.itemType} onChange={e => setImportForm({ ...importForm, itemType: e.target.value })}>
                  {itemTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Default Sell Price (cents)</Label>
                <Input type="number" value={importForm.defaultUnitPriceCents} onChange={e => setImportForm({ ...importForm, defaultUnitPriceCents: e.target.value })} placeholder="e.g. 1200" />
              </div>
              <div className="space-y-2">
                <Label>Default Cost (cents)</Label>
                <Input type="number" value={importForm.defaultUnitCostCents} onChange={e => setImportForm({ ...importForm, defaultUnitCostCents: e.target.value })} placeholder="e.g. 800" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Vendor: {importDialog?.vendorName || '-'} | SKU: {importDialog?.sku || '-'}</p>
            {importResult && <p className="text-sm text-green-600">{importResult}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(null)}>Cancel</Button>
            <Button onClick={importProduct} disabled={importSaving}>
              {importSaving ? 'Importing...' : 'Import to Catalog'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
