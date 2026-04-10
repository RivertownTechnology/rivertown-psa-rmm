import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft, Plus, DollarSign, Calendar, FileText, Send,
  CheckCircle, XCircle, RefreshCw, Package, Trash2, AlertTriangle,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Quote {
  id: string;
  quoteNumber: number;
  title: string;
  summary: string | null;
  status: string;
  customerId: string;
  contactId: string | null;
  validUntil: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  approvedAt: string | null;
  convertedContractId: string | null;
  convertedInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QuoteLineItem {
  id: string;
  description: string;
  itemType: string;
  unitPriceCents: number;
  quantity: string | null;
  sortOrder: number;
  taxable: boolean;
}

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  itemType: string;
  defaultUnitPriceCents: number;
  defaultUnitCostCents: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeLabels: Record<string, string> = {
  recurring: 'Recurring',
  per_device: 'Per Device',
  per_user: 'Per User',
  one_time: 'One Time',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'default',
  viewed: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  converted: 'secondary',
};

const statusClassName: Record<string, string> = {
  approved: 'bg-green-600 hover:bg-green-600/80',
};

const categoryLabels: Record<string, string> = {
  license: 'License',
  rmm: 'RMM',
  edr_av: 'EDR/AV',
  backup: 'Backup',
  managed_service: 'Managed Service',
  support_hours: 'Support Hours',
  hardware: 'Hardware',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuoteDetailPage({ quoteId, onBack, onNavigateToCustomer, onNavigateToContract }: {
  quoteId: string;
  onBack: () => void;
  onNavigateToCustomer: (id: string) => void;
  onNavigateToContract: (id: string) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  // Add line item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    description: '',
    itemType: 'recurring',
    unitPriceCents: '',
    quantity: '1',
    taxable: false,
  });

  // Catalog picker
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogQty, setCatalogQty] = useState('1');

  // Convert dialog
  const [showConvert, setShowConvert] = useState(false);
  const [convertTo, setConvertTo] = useState<'contract' | 'invoice'>('contract');

  // Notes editing
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadQuote = useCallback(async () => {
    const data = await api<Quote>(`/quotes/${quoteId}`);
    setQuote(data);
    try {
      const cust = await api<{ name: string }>(`/customers/${data.customerId}`);
      setCustomerName(cust.name);
    } catch { /* */ }
  }, [quoteId]);

  const loadLineItems = useCallback(async () => {
    const items = await api<QuoteLineItem[]>(`/quotes/${quoteId}/line-items`);
    setLineItems(items);
  }, [quoteId]);

  const reload = useCallback(async () => {
    await Promise.all([loadQuote(), loadLineItems()]);
  }, [loadQuote, loadLineItems]);

  useEffect(() => { reload(); }, [reload]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function sendQuote() {
    setActionLoading('send');
    try {
      await api(`/quotes/${quoteId}/send`, { method: 'POST' });
      await reload();
    } finally { setActionLoading(''); }
  }

  async function approveQuote() {
    setActionLoading('approve');
    try {
      await api(`/quotes/${quoteId}/approve`, { method: 'POST' });
      await reload();
    } finally { setActionLoading(''); }
  }

  async function rejectQuote() {
    setActionLoading('reject');
    try {
      await api(`/quotes/${quoteId}/reject`, { method: 'POST' });
      await reload();
    } finally { setActionLoading(''); }
  }

  async function convertQuote() {
    setActionLoading('convert');
    try {
      const result = await api<{ contractId?: string; invoiceId?: string }>(`/quotes/${quoteId}/convert`, {
        method: 'POST',
        body: JSON.stringify({ convertTo }),
      });
      setShowConvert(false);
      await reload();
      if (result.contractId && convertTo === 'contract') {
        onNavigateToContract(result.contractId);
      }
    } finally { setActionLoading(''); }
  }

  // -------------------------------------------------------------------------
  // Line item management
  // -------------------------------------------------------------------------

  async function addLineItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/quotes/${quoteId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({
          description: itemForm.description,
          itemType: itemForm.itemType,
          unitPriceCents: Math.round(parseFloat(itemForm.unitPriceCents) * 100),
          quantity: itemForm.quantity,
          taxable: itemForm.taxable,
        }),
      });
      setShowAddItem(false);
      setItemForm({ description: '', itemType: 'recurring', unitPriceCents: '', quantity: '1', taxable: false });
      await reload();
    } finally { setSaving(false); }
  }

  async function deleteLineItem(lineId: string) {
    await api(`/quotes/${quoteId}/line-items/${lineId}`, { method: 'DELETE' });
    await reload();
  }

  async function openCatalog() {
    const items = await api<CatalogItem[]>('/service-catalog');
    setCatalogItems(items);
    setShowCatalog(true);
  }

  async function addFromCatalog(item: CatalogItem) {
    setSaving(true);
    try {
      await api(`/quotes/${quoteId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({
          description: item.name,
          itemType: item.itemType,
          unitPriceCents: item.defaultUnitPriceCents,
          quantity: catalogQty,
          taxable: false,
        }),
      });
      setShowCatalog(false);
      setCatalogQty('1');
      await reload();
    } finally { setSaving(false); }
  }

  // -------------------------------------------------------------------------
  // Summary/notes save
  // -------------------------------------------------------------------------

  async function saveSummary() {
    setSaving(true);
    try {
      await api(`/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ summary: summaryDraft }),
      });
      setEditingSummary(false);
      await loadQuote();
    } finally { setSaving(false); }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function lineTotal(item: QuoteLineItem): number {
    return item.unitPriceCents * parseFloat(item.quantity ?? '1');
  }

  function isExpired(): boolean {
    if (!quote?.validUntil) return false;
    return new Date(quote.validUntil) < new Date();
  }

  const isDraft = quote?.status === 'draft';
  const isSent = quote?.status === 'sent' || quote?.status === 'viewed';
  const isApproved = quote?.status === 'approved';
  const isConverted = quote?.status === 'converted';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!quote) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Quotes', href: '/billing/quotes' }, { label: `Quote #${quote.quoteNumber}` }]} />
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-xl font-semibold">Quote #{quote.quoteNumber}</h2>
        <Badge
          variant={statusVariant[quote.status] ?? 'secondary'}
          className={statusClassName[quote.status] ?? ''}
        >
          {quote.status}
        </Badge>
        <span className="text-sm text-muted-foreground">|</span>
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => onNavigateToCustomer(quote.customerId)}
        >
          {customerName}
        </button>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-lg font-medium text-foreground">{quote.title}</h3>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {isDraft && (
          <Button size="sm" onClick={sendQuote} disabled={actionLoading === 'send'}>
            <Send className="h-4 w-4 mr-1" />
            {actionLoading === 'send' ? 'Sending...' : 'Send Quote'}
          </Button>
        )}
        {isSent && (
          <>
            <Button size="sm" onClick={approveQuote} disabled={actionLoading === 'approve'}
              className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-1" />
              {actionLoading === 'approve' ? 'Approving...' : 'Mark Approved'}
            </Button>
            <Button size="sm" variant="destructive" onClick={rejectQuote} disabled={actionLoading === 'reject'}>
              <XCircle className="h-4 w-4 mr-1" />
              {actionLoading === 'reject' ? 'Rejecting...' : 'Mark Rejected'}
            </Button>
          </>
        )}
        {isApproved && (
          <Button size="sm" onClick={() => setShowConvert(true)}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Convert Quote
          </Button>
        )}
        {isConverted && quote.convertedContractId && (
          <Button size="sm" variant="outline" onClick={() => onNavigateToContract(quote.convertedContractId!)}>
            <FileText className="h-4 w-4 mr-1" />
            View Contract
          </Button>
        )}
        {isConverted && quote.convertedInvoiceId && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <FileText className="h-3 w-3 mr-1" />
            Converted to Invoice
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={async () => {
          const { token } = await api<{ token: string }>(`/quotes/${quoteId}/preview-token`, { method: 'POST' });
          window.open(`/api/v1/quotes/${quoteId}/html?token=${token}`, '_blank');
        }}>
          Export PDF
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Subtotal</div>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">{formatCents(quote.subtotalCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Tax</div>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">{formatCents(quote.taxCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Total</div>
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">{formatCents(quote.totalCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Valid Until</div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-1">
              {quote.validUntil ? (
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${isExpired() ? 'text-red-500' : ''}`}>
                    {new Date(quote.validUntil).toLocaleDateString()}
                  </span>
                  {isExpired() && (
                    <span className="flex items-center text-xs text-red-500">
                      <AlertTriangle className="h-3 w-3 mr-0.5" /> Expired
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-lg font-bold text-muted-foreground">No date set</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Line Items ({lineItems.length})</CardTitle>
            {isDraft && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={openCatalog}>
                  <Package className="h-4 w-4 mr-1" /> Add from Catalog
                </Button>
                <Button size="sm" onClick={() => setShowAddItem(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Line Item
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-right p-3 font-medium">Qty</th>
                  <th className="text-right p-3 font-medium">Unit Price</th>
                  <th className="text-right p-3 font-medium">Line Total</th>
                  {isDraft && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {lineItems.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{item.description}</div>
                      {item.taxable && (
                        <span className="text-xs text-muted-foreground">Taxable</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {typeLabels[item.itemType] ?? item.itemType.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">{parseFloat(item.quantity ?? '1')}</td>
                    <td className="p-3 text-right">{formatCents(item.unitPriceCents)}</td>
                    <td className="p-3 text-right font-medium">{formatCents(lineTotal(item))}</td>
                    {isDraft && (
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLineItem(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={isDraft ? 6 : 5} className="p-8 text-center text-muted-foreground">
                      No line items — add from catalog or create manually
                    </td>
                  </tr>
                )}
              </tbody>
              {lineItems.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={isDraft ? 4 : 3} className="p-3 text-right font-medium">Subtotal</td>
                    <td className="p-3 text-right font-medium">{formatCents(quote.subtotalCents)}</td>
                    {isDraft && <td />}
                  </tr>
                  <tr className="bg-muted/30">
                    <td colSpan={isDraft ? 4 : 3} className="p-3 text-right font-medium text-muted-foreground">Tax</td>
                    <td className="p-3 text-right font-medium text-muted-foreground">{formatCents(quote.taxCents)}</td>
                    {isDraft && <td />}
                  </tr>
                  <tr className="bg-muted/30 border-t">
                    <td colSpan={isDraft ? 4 : 3} className="p-3 text-right font-semibold text-green-600">Total</td>
                    <td className="p-3 text-right font-semibold text-green-600">{formatCents(quote.totalCents)}</td>
                    {isDraft && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Notes / Summary</CardTitle>
            {isDraft && !editingSummary && (
              <Button variant="outline" size="sm" onClick={() => {
                setSummaryDraft(quote.summary ?? '');
                setEditingSummary(true);
              }}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingSummary ? (
            <div className="space-y-3">
              <textarea
                rows={4}
                value={summaryDraft}
                onChange={e => setSummaryDraft(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Add notes or summary for this quote..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingSummary(false)}>Cancel</Button>
                <Button size="sm" disabled={saving} onClick={saveSummary}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {quote.summary || 'No notes yet.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Line Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
          <form onSubmit={addLineItem} className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                required
                value={itemForm.description}
                onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Microsoft 365 Business Premium"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={itemForm.itemType}
                  onChange={e => setItemForm({ ...itemForm, itemType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="recurring">Recurring</option>
                  <option value="per_device">Per Device</option>
                  <option value="per_user">Per User</option>
                  <option value="one_time">One Time</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={itemForm.quantity}
                  onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="15.00"
                  value={itemForm.unitPriceCents}
                  onChange={e => setItemForm({ ...itemForm, unitPriceCents: e.target.value })}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.taxable}
                    onChange={e => setItemForm({ ...itemForm, taxable: e.target.checked })}
                    className="rounded border-input"
                  />
                  Taxable
                </label>
              </div>
            </div>
            {itemForm.unitPriceCents && itemForm.quantity && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="flex justify-between">
                  <span>Line total:</span>
                  <span className="font-medium">
                    ${(parseFloat(itemForm.unitPriceCents) * parseFloat(itemForm.quantity)).toFixed(2)}
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
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border"
                    >
                      <div>
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Price: {formatCents(item.defaultUnitPriceCents)} | {item.itemType.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addFromCatalog(item)} disabled={saving}>
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

      {/* Convert Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Convert Quote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Convert this approved quote into a contract or invoice.
            </p>
            <div className="space-y-2">
              <Label>Convert to</Label>
              <select
                value={convertTo}
                onChange={e => setConvertTo(e.target.value as 'contract' | 'invoice')}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="contract">Contract</option>
                <option value="invoice">Invoice</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvert(false)}>Cancel</Button>
            <Button onClick={convertQuote} disabled={actionLoading === 'convert'}>
              {actionLoading === 'convert' ? 'Converting...' : `Convert to ${convertTo === 'contract' ? 'Contract' : 'Invoice'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
