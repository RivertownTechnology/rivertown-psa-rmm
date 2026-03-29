import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents, formatCentsShort } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Plus, DollarSign, TrendingUp, PieChart, Clock, Pencil, Trash2,
  ShieldCheck, Cpu, Shield, HardDrive, Package, Headphones, Wrench, MoreHorizontal,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

interface LineItem {
  id: string; description: string; itemType: string; category: string | null;
  unitPriceCents: number; unitCostCents: number | null; quantity: string | null;
  blockHours: string | null; blockHoursUsed: string | null; taxable: boolean;
  pax8SubscriptionId: string | null;
  lineTotalRevenueCents: number; lineTotalCostCents: number | null;
  lineProfitCents: number | null; marginPercent: number | null;
}

interface TimeEntry {
  id: string; ticketId: string; userId: string; durationMinutes: number | null;
  isBillable: boolean; rateCents: number | null; notes: string | null;
  startedAt: string; ticketNumber: number; ticketSubject: string;
  techName: string; techCostCents: number;
}

interface ContractDetail {
  id: string; name: string; contractType: string; status: string;
  customerId: string; startDate: string; endDate: string | null;
  billingCycle: string; autoRenew: boolean; notes: string | null;
  lineItems: LineItem[];
  timeEntries: TimeEntry[];
  summary: {
    totalMonthlyRevenueCents: number; productCostCents: number;
    laborCostCents: number; totalCostCents: number;
    trueProfitCents: number; trueMarginPercent: number;
    totalMonthlyCostCents: number; monthlyProfitCents: number; marginPercent: number;
    totalLaborHours: number; coveredLaborHours: number; billableLaborHours: number;
    internalCostPerHourCents: number;
    coveredHoursTotal: number; coveredHoursUsed: number; coveredHoursRemaining: number;
  };
}

interface CatalogItem {
  id: string; name: string; category: string; itemType: string;
  defaultUnitCostCents: number | null; defaultUnitPriceCents: number;
}

const categoryIcons: Record<string, typeof ShieldCheck> = {
  license: ShieldCheck, rmm: Cpu, edr_av: Shield, backup: HardDrive,
  managed_service: Package, support_hours: Headphones, hardware: Wrench, other: MoreHorizontal,
};

const categoryLabels: Record<string, string> = {
  license: 'License', rmm: 'RMM', edr_av: 'EDR/AV', backup: 'Backup',
  managed_service: 'Managed Service', support_hours: 'Support Hours', hardware: 'Hardware', other: 'Other',
};

const typeLabels: Record<string, string> = {
  managed_services: 'Managed Services', break_fix: 'Break/Fix',
  per_device: 'Per Device', per_user: 'Per User', block_time: 'Block Time',
  recurring_flat: 'Flat Rate', ad_hoc: 'Ad-Hoc',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', draft: 'outline', expired: 'secondary', cancelled: 'destructive',
};

export function ContractDetailPage({ contractId, onBack, onNavigateToCustomer }: {
  contractId: string; onBack: () => void; onNavigateToCustomer: (id: string) => void;
}) {
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [tab, setTab] = useState('line-items');

  // Edit contract
  const [showEditContract, setShowEditContract] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', contractType: 'managed_services', status: 'draft',
    startDate: '', endDate: '', billingCycle: 'monthly', autoRenew: true, notes: '',
  });

  // Add line item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogQty, setCatalogQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState({
    description: '', itemType: 'recurring', category: 'other',
    unitPriceCents: '', unitCostCents: '', quantity: '1', blockHours: '',
  });

  const load = useCallback(async () => {
    const data = await api<ContractDetail>(`/contracts/${contractId}`);
    setContract(data);
    try {
      const cust = await api<{ name: string }>(`/customers/${data.customerId}`);
      setCustomerName(cust.name);
    } catch { /* */ }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  async function addLineItem(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/contracts/${contractId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({
          description: itemForm.description,
          itemType: itemForm.itemType,
          category: itemForm.category || undefined,
          unitPriceCents: Math.round(parseFloat(itemForm.unitPriceCents) * 100),
          unitCostCents: itemForm.unitCostCents ? Math.round(parseFloat(itemForm.unitCostCents) * 100) : undefined,
          quantity: itemForm.quantity,
          blockHours: itemForm.blockHours || undefined,
        }),
      });
      setShowAddItem(false);
      setItemForm({ description: '', itemType: 'recurring', category: 'other', unitPriceCents: '', unitCostCents: '', quantity: '1', blockHours: '' });
      load();
    } finally { setSaving(false); }
  }

  async function deleteLineItem(lineId: string) {
    await api(`/contracts/${contractId}/line-items/${lineId}`, { method: 'DELETE' });
    load();
  }

  async function openCatalog() {
    const items = await api<CatalogItem[]>('/service-catalog');
    setCatalogItems(items);
    setShowCatalog(true);
  }

  async function addFromCatalog(catalogItemId: string) {
    setSaving(true);
    try {
      await api(`/contracts/${contractId}/add-from-catalog`, {
        method: 'POST',
        body: JSON.stringify({ catalogItemId, quantity: catalogQty }),
      });
      setShowCatalog(false);
      setCatalogQty('1');
      load();
    } finally { setSaving(false); }
  }

  function openEditContract() {
    if (!contract) return;
    setEditForm({
      name: contract.name,
      contractType: contract.contractType,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate ?? '',
      billingCycle: contract.billingCycle,
      autoRenew: contract.autoRenew,
      notes: contract.notes ?? '',
    });
    setShowEditContract(true);
  }

  async function saveContract(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/contracts/${contractId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          contractType: editForm.contractType,
          status: editForm.status,
          startDate: editForm.startDate,
          endDate: editForm.endDate || undefined,
          billingCycle: editForm.billingCycle,
          autoRenew: editForm.autoRenew,
          notes: editForm.notes || undefined,
        }),
      });
      setShowEditContract(false);
      load();
    } finally { setSaving(false); }
  }

  async function updateStatus(newStatus: string) {
    await api(`/contracts/${contractId}`, {
      method: 'PATCH', body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function deleteContract() {
    if (!confirm(`Delete contract "${contract?.name}"? This will remove all line items and cannot be undone.`)) return;
    await api(`/contracts/${contractId}`, { method: 'DELETE' });
    onBack();
  }

  if (!contract) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const s = contract.summary;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Contracts', href: '/billing/contracts' }, { label: contract.name }]} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h2 className="text-xl font-semibold">{contract.name}</h2>
          <Badge variant={statusVariant[contract.status] ?? 'secondary'}>{contract.status}</Badge>
          <Badge variant="outline">{typeLabels[contract.contractType] ?? contract.contractType}</Badge>
          <span className="text-sm text-muted-foreground">|</span>
          <button className="text-sm text-primary hover:underline" onClick={() => onNavigateToCustomer(contract.customerId)}>
            {customerName}
          </button>
          <span className="text-sm text-muted-foreground capitalize">| {contract.billingCycle} | {contract.startDate}{contract.endDate ? ` to ${contract.endDate}` : ' (ongoing)'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditContract}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteContract}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
        </div>
      </div>

      {/* Status actions */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Status:</span>
          {['draft', 'active', 'expired', 'cancelled'].map(s => (
            <Button
              key={s}
              variant={contract.status === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => contract.status !== s && updateStatus(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
          {contract.autoRenew && <Badge variant="outline" className="ml-2">Auto-Renew</Badge>}
        </CardContent>
      </Card>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Revenue</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{formatCentsShort(s.totalMonthlyRevenueCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Product Cost</div>
            <div className="text-2xl font-bold text-red-500 mt-1">{formatCentsShort(s.productCostCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Labor Cost</div>
            <div className="text-2xl font-bold text-orange-500 mt-1">{formatCentsShort(s.laborCostCents)}</div>
            <div className="text-xs text-muted-foreground">{s.totalLaborHours}h @ {formatCents(s.internalCostPerHourCents)}/hr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">True Profit</div>
            <div className={`text-2xl font-bold mt-1 ${s.trueProfitCents >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCentsShort(s.trueProfitCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">True Margin</div>
            <div className={`text-2xl font-bold mt-1 ${s.trueMarginPercent >= 30 ? 'text-purple-600' : s.trueMarginPercent >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>{s.trueMarginPercent}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Block time indicator */}
      {s.coveredHoursTotal > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span>Block Time: {s.coveredHoursUsed.toFixed(1)} / {s.coveredHoursTotal} hrs used</span>
                  <span className="font-medium">{s.coveredHoursRemaining.toFixed(1)} hrs remaining</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${s.coveredHoursRemaining <= 0 ? 'bg-red-500' : s.coveredHoursRemaining < s.coveredHoursTotal * 0.2 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, (s.coveredHoursUsed / s.coveredHoursTotal) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="line-items">Line Items ({contract.lineItems.length})</TabsTrigger>
          <TabsTrigger value="time">Time Tracking</TabsTrigger>
        </TabsList>

        {/* LINE ITEMS TAB */}
        <TabsContent value="line-items">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={openCatalog}><Package className="h-4 w-4 mr-1" />Add from Catalog</Button>
              <Button size="sm" onClick={() => setShowAddItem(true)}><Plus className="h-4 w-4 mr-1" />Add Line Item</Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium w-8"></th>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-left p-3 font-medium">Category</th>
                        <th className="text-right p-3 font-medium">Qty</th>
                        <th className="text-right p-3 font-medium">Unit Cost</th>
                        <th className="text-right p-3 font-medium">Unit Price</th>
                        <th className="text-right p-3 font-medium">Margin</th>
                        <th className="text-right p-3 font-medium">Line Total</th>
                        <th className="text-right p-3 font-medium">Profit</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.lineItems.map(item => {
                        const CatIcon = categoryIcons[item.category ?? 'other'] ?? MoreHorizontal;
                        return (
                          <tr key={item.id} className="border-b hover:bg-muted/30">
                            <td className="p-3"><CatIcon className="h-4 w-4 text-muted-foreground" /></td>
                            <td className="p-3">
                              <div className="font-medium">{item.description}</div>
                              {item.pax8SubscriptionId && <span className="text-xs text-blue-600">Pax8 linked</span>}
                              {item.itemType === 'block_time' && (
                                <span className="text-xs text-muted-foreground ml-1">({parseFloat(item.blockHoursUsed ?? '0').toFixed(1)}/{item.blockHours} hrs)</span>
                              )}
                            </td>
                            <td className="p-3"><Badge variant="outline" className="text-xs">{categoryLabels[item.category ?? 'other'] ?? item.category}</Badge></td>
                            <td className="p-3 text-right">{parseFloat(item.quantity ?? '1')}</td>
                            <td className="p-3 text-right text-muted-foreground">{formatCents(item.unitCostCents)}</td>
                            <td className="p-3 text-right">{formatCents(item.unitPriceCents)}</td>
                            <td className="p-3 text-right">
                              {item.marginPercent !== null ? (
                                <span className={item.marginPercent >= 50 ? 'text-green-600' : item.marginPercent >= 20 ? 'text-yellow-600' : 'text-red-500'}>
                                  {item.marginPercent}%
                                </span>
                              ) : '-'}
                            </td>
                            <td className="p-3 text-right font-medium">{formatCents(item.lineTotalRevenueCents)}</td>
                            <td className="p-3 text-right">
                              {item.lineProfitCents !== null ? (
                                <span className={item.lineProfitCents >= 0 ? 'text-green-600' : 'text-red-500'}>
                                  {formatCents(item.lineProfitCents)}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="p-3">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLineItem(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {contract.lineItems.length === 0 && (
                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No line items — add from catalog or create manually</td></tr>
                      )}
                    </tbody>
                    {contract.lineItems.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 font-medium">
                          <td colSpan={4} className="p-3">Product Totals</td>
                          <td className="p-3 text-right text-red-500">{formatCentsShort(s.productCostCents)}</td>
                          <td className="p-3 text-right"></td>
                          <td className="p-3 text-right"></td>
                          <td className="p-3 text-right text-green-600">{formatCentsShort(s.totalMonthlyRevenueCents)}</td>
                          <td className="p-3 text-right">{formatCentsShort(s.totalMonthlyRevenueCents - s.productCostCents)}</td>
                          <td></td>
                        </tr>
                        {s.laborCostCents > 0 && (
                          <tr className="bg-muted/30 text-sm">
                            <td colSpan={4} className="p-3 text-orange-500">+ Labor Cost ({s.totalLaborHours}h)</td>
                            <td className="p-3 text-right text-orange-500">{formatCentsShort(s.laborCostCents)}</td>
                            <td colSpan={3}></td>
                            <td className="p-3 text-right font-medium text-blue-600">{formatCentsShort(s.trueProfitCents)}</td>
                            <td></td>
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TIME TRACKING TAB */}
        <TabsContent value="time">
          <div className="mt-4 space-y-4">
            {/* Labor summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Hours</div>
                <div className="text-2xl font-bold">{s.totalLaborHours}h</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Covered (not billed)</div>
                <div className="text-2xl font-bold text-green-600">{s.coveredLaborHours}h</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Billable (overage)</div>
                <div className="text-2xl font-bold text-orange-500">{s.billableLaborHours}h</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Labor Cost to MSP</div>
                <div className="text-2xl font-bold text-red-500">{formatCentsShort(s.laborCostCents)}</div>
                <div className="text-xs text-muted-foreground">@ {formatCents(s.internalCostPerHourCents)}/hr internal rate</div>
              </CardContent></Card>
            </div>

            {/* Time entries table */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Tech</th>
                    <th className="text-left p-3 font-medium">Ticket</th>
                    <th className="text-right p-3 font-medium">Duration</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Rate</th>
                    <th className="text-right p-3 font-medium">Cost</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                  </tr></thead>
                  <tbody>
                    {contract.timeEntries.map(e => {
                      const hours = (e.durationMinutes ?? 0) / 60;
                      const cost = Math.round(hours * e.techCostCents);
                      return (
                        <tr key={e.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-muted-foreground">{new Date(e.startedAt).toLocaleDateString()}</td>
                          <td className="p-3 text-sm">{e.techName}</td>
                          <td className="p-3"><span className="text-primary font-medium">#{e.ticketNumber}</span> {e.ticketSubject}</td>
                          <td className="p-3 text-right font-medium">{hours.toFixed(1)}h</td>
                          <td className="p-3">
                            <Badge variant={e.isBillable ? 'default' : 'outline'}>
                              {e.isBillable ? 'Billable' : 'Covered'}
                            </Badge>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{formatCents(e.techCostCents)}/hr</td>
                          <td className="p-3 text-right text-red-500">{formatCents(cost)}</td>
                          <td className="p-3 text-muted-foreground max-w-[200px] truncate">{e.notes ?? '-'}</td>
                        </tr>
                      );
                    })}
                    {contract.timeEntries.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No time logged yet. Create tickets under this contract and log time to track labor costs.
                      </td></tr>
                    )}
                  </tbody>
                  {contract.timeEntries.length > 0 && (
                    <tfoot><tr className="border-t-2 bg-muted/30 font-medium">
                      <td colSpan={3} className="p-3">Total</td>
                      <td className="p-3 text-right">{s.totalLaborHours}h</td>
                      <td className="p-3"></td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right text-red-500">{formatCentsShort(s.laborCostCents)}</td>
                      <td></td>
                    </tr></tfoot>
                  )}
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Line Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
          <form onSubmit={addLineItem} className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input required value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Microsoft 365 Business Premium" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <select value={itemForm.itemType} onChange={e => setItemForm({ ...itemForm, itemType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="recurring">Recurring</option>
                  <option value="per_device">Per Device</option>
                  <option value="per_user">Per User</option>
                  <option value="block_time">Block Time</option>
                  <option value="one_time">One Time</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="license">License</option>
                  <option value="rmm">RMM</option>
                  <option value="edr_av">EDR/AV</option>
                  <option value="backup">Backup</option>
                  <option value="managed_service">Managed Service</option>
                  <option value="support_hours">Support Hours</option>
                  <option value="hardware">Hardware</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" min="0" placeholder="12.00" value={itemForm.unitCostCents} onChange={e => setItemForm({ ...itemForm, unitCostCents: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input type="number" step="0.01" min="0" required placeholder="15.00" value={itemForm.unitPriceCents} onChange={e => setItemForm({ ...itemForm, unitPriceCents: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} />
              </div>
            </div>
            {itemForm.itemType === 'block_time' && (
              <div className="space-y-2">
                <Label>Block Hours</Label>
                <Input type="number" min="0" step="0.5" placeholder="10" value={itemForm.blockHours} onChange={e => setItemForm({ ...itemForm, blockHours: e.target.value })} />
              </div>
            )}
            {itemForm.unitCostCents && itemForm.unitPriceCents && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="flex justify-between">
                  <span>Margin:</span>
                  <span className="font-medium">
                    {((1 - parseFloat(itemForm.unitCostCents) / parseFloat(itemForm.unitPriceCents)) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Monthly profit (x{itemForm.quantity}):</span>
                  <span className="font-medium text-green-600">
                    ${((parseFloat(itemForm.unitPriceCents) - parseFloat(itemForm.unitCostCents)) * parseFloat(itemForm.quantity)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Line Item'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Catalog Picker Dialog */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add from Service Catalog</DialogTitle></DialogHeader>
          <div className="space-y-2 mb-4">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={catalogQty} onChange={e => setCatalogQty(e.target.value)} className="w-24" />
          </div>
          {catalogItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No catalog items yet. Add items in Settings to use them here.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                catalogItems.reduce<Record<string, CatalogItem[]>>((acc, item) => {
                  (acc[item.category] ??= []).push(item);
                  return acc;
                }, {}),
              ).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {categoryLabels[cat] ?? cat}
                  </div>
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border">
                      <div>
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Cost: {formatCents(item.defaultUnitCostCents)} | Price: {formatCents(item.defaultUnitPriceCents)} | {item.itemType.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addFromCatalog(item.id)} disabled={saving}>
                        <Plus className="h-3 w-3 mr-1" />Add
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Contract Dialog */}
      <Dialog open={showEditContract} onOpenChange={setShowEditContract}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Contract</DialogTitle></DialogHeader>
          <form onSubmit={saveContract} className="space-y-4">
            <div className="space-y-2">
              <Label>Contract Name</Label>
              <Input required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <select value={editForm.contractType} onChange={e => setEditForm({ ...editForm, contractType: e.target.value })}
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
              <div className="space-y-2">
                <Label>Status</Label>
                <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Billing Cycle</Label>
                <select value={editForm.billingCycle} onChange={e => setEditForm({ ...editForm, billingCycle: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="space-y-2 flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editForm.autoRenew} onChange={e => setEditForm({ ...editForm, autoRenew: e.target.checked })} className="h-4 w-4" />
                  Auto-Renew
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" required value={editForm.startDate} onChange={e => setEditForm({ ...editForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={editForm.endDate} onChange={e => setEditForm({ ...editForm, endDate: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave blank for ongoing</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea rows={3} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Internal notes about this contract..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditContract(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
