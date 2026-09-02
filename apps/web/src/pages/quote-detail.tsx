import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Plus, DollarSign, Calendar, FileText, Send,
  CheckCircle, XCircle, RefreshCw, Package, Trash2, AlertTriangle, Search,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Combobox } from '@/components/ui/combobox';
import { SendQuoteDialog } from '@/components/send-quote-dialog';

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
  declineReason: string | null;
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
  listUnitPriceCents: number | null;
  unitCostCents: number | null;
  catalogItemId: string | null;
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

interface SignatureInfo {
  id: string;
  status: string;
  recipientEmail: string;
  signerName: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  ipAddress: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdAt: string;
}

interface Agreement {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  hasIdDocument?: boolean;
  signature?: {
    verificationStatus: string | null;
    verificationSessionId: string | null;
  } | null;
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
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [signature, setSignature] = useState<SignatureInfo | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [agreementResendTo, setAgreementResendTo] = useState('');
  const [agreementMessage, setAgreementMessage] = useState('');
  const [signatureMessage, setSignatureMessage] = useState('');

  // Add line item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    description: '',
    itemType: 'recurring',
    unitPriceCents: '',
    listUnitPriceCents: '',
    unitCostCents: '',
    quantity: '1',
    taxable: false,
  });

  // Inline qty/price drafts, keyed by line item id
  const [lineEdits, setLineEdits] = useState<Record<string, { quantity: string; unitPrice: string }>>({});

  // Catalog picker
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogQty, setCatalogQty] = useState('1');
  const [catalogSearch, setCatalogSearch] = useState('');

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
    setLineEdits(Object.fromEntries(items.map(i => [i.id, {
      quantity: String(parseFloat(i.quantity ?? '1')),
      unitPrice: (i.unitPriceCents / 100).toFixed(2),
    }])));
  }, [quoteId]);

  const loadSignature = useCallback(async () => {
    try {
      const sig = await api<SignatureInfo | null>(`/quotes/${quoteId}/signature`);
      setSignature(sig);
    } catch { /* */ }
    try {
      const agreements = await api<Agreement[]>(`/agreements?quoteId=${quoteId}`);
      if (agreements[0]) {
        // Detail call adds signature + hasIdDocument
        const detail = await api<Agreement>(`/agreements/${agreements[0].id}`);
        setAgreement(detail);
      } else {
        setAgreement(null);
      }
    } catch { /* */ }
  }, [quoteId]);

  const reload = useCallback(async () => {
    await Promise.all([loadQuote(), loadLineItems(), loadSignature()]);
  }, [loadQuote, loadLineItems, loadSignature]);

  useEffect(() => { reload(); }, [reload]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function resendAgreement() {
    if (!agreement || !agreementResendTo) return;
    setActionLoading('resendAgreement');
    setAgreementMessage('');
    try {
      await api(`/agreements/${agreement.id}/resend`, { method: 'POST', body: JSON.stringify({ to: agreementResendTo }) });
      setAgreementMessage('Agreement resent.');
      await loadSignature();
    } catch (err: unknown) {
      setAgreementMessage(err instanceof Error ? err.message : 'Resend failed');
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

  async function voidSignature() {
    setActionLoading('voidSig'); setSignatureMessage('');
    try {
      await api(`/quotes/${quoteId}/signature/void`, { method: 'POST' });
      await reload();
    } catch (err) {
      setSignatureMessage(err instanceof Error ? err.message : 'Could not cancel the request');
    } finally { setActionLoading(''); }
  }

  async function revertToDraft() {
    setActionLoading('revert');
    try {
      await api(`/quotes/${quoteId}/revert-to-draft`, { method: 'POST' });
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
          listUnitPriceCents: itemForm.listUnitPriceCents ? Math.round(parseFloat(itemForm.listUnitPriceCents) * 100) : null,
          unitCostCents: itemForm.unitCostCents ? Math.round(parseFloat(itemForm.unitCostCents) * 100) : null,
          quantity: itemForm.quantity,
          taxable: itemForm.taxable,
        }),
      });
      setShowAddItem(false);
      setItemForm({ description: '', itemType: 'recurring', unitPriceCents: '', listUnitPriceCents: '', unitCostCents: '', quantity: '1', taxable: false });
      await reload();
    } finally { setSaving(false); }
  }

  async function deleteLineItem(lineId: string) {
    await api(`/quotes/${quoteId}/line-items/${lineId}`, { method: 'DELETE' });
    await reload();
  }

  // Commit an inline qty/price edit when the input loses focus (or Enter)
  async function commitLineEdit(item: QuoteLineItem) {
    const draft = lineEdits[item.id];
    if (!draft) return;
    const qty = parseFloat(draft.quantity);
    const price = parseFloat(draft.unitPrice);
    const priceCents = Math.round(price * 100);
    const qtyChanged = Number.isFinite(qty) && qty > 0 && qty !== parseFloat(item.quantity ?? '1');
    const priceChanged = Number.isFinite(price) && price >= 0 && priceCents !== item.unitPriceCents;
    if (!qtyChanged && !priceChanged) {
      // Reset any invalid draft back to the saved values
      setLineEdits(prev => ({ ...prev, [item.id]: {
        quantity: String(parseFloat(item.quantity ?? '1')),
        unitPrice: (item.unitPriceCents / 100).toFixed(2),
      }}));
      return;
    }
    const body: Record<string, unknown> = {};
    if (qtyChanged) body.quantity = String(qty);
    if (priceChanged) body.unitPriceCents = priceCents;
    await api(`/quotes/${quoteId}/line-items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    await reload();
  }

  // Internal-only margin readout — never appears on customer-facing documents
  function marginInfo(item: QuoteLineItem, draftPrice?: string): { label: string; under: boolean } | null {
    if (item.unitCostCents == null) return null;
    const price = draftPrice !== undefined && Number.isFinite(parseFloat(draftPrice))
      ? Math.round(parseFloat(draftPrice) * 100)
      : item.unitPriceCents;
    const cost = item.unitCostCents;
    if (price <= 0) return { label: `Cost ${formatCents(cost)}`, under: cost > 0 };
    const margin = Math.round(((price - cost) / price) * 100);
    return { label: `Cost ${formatCents(cost)} · ${margin}% margin`, under: price < cost };
  }

  // Catalog picker filter. Matches the three things visible on each row —
  // name, category label, and item type — so what you type maps to what you see.
  const catalogQuery = catalogSearch.trim().toLowerCase();
  const filteredCatalogItems = catalogQuery
    ? catalogItems.filter(item =>
        item.name.toLowerCase().includes(catalogQuery)
        || (categoryLabels[item.category] ?? item.category).toLowerCase().includes(catalogQuery)
        || item.itemType.replace(/_/g, ' ').toLowerCase().includes(catalogQuery))
    : catalogItems;

  async function openCatalog() {
    const items = await api<CatalogItem[]>('/service-catalog');
    setCatalogItems(items);
    setCatalogSearch('');
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
          listUnitPriceCents: item.defaultUnitPriceCents,
          unitCostCents: item.defaultUnitCostCents ?? null,
          catalogItemId: item.id,
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

  if (!quote) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card><CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent></Card>
          </div>
          <div className="space-y-4">
            <Card><CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </CardContent></Card>
          </div>
        </div>
      </div>
    );
  }

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
          <Button size="sm" onClick={() => setShowSendDialog(true)}>
            <Send className="h-4 w-4 mr-1" />
            Send Quote
          </Button>
        )}
        {isSent && (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowSendDialog(true)}>
              <Send className="h-4 w-4 mr-1" />
              Resend Quote
            </Button>
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
          <>
            <Button size="sm" onClick={() => setShowConvert(true)}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Convert Quote
            </Button>
            <Button size="sm" variant="outline" onClick={revertToDraft} disabled={actionLoading === 'revert'}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {actionLoading === 'revert' ? 'Reverting…' : 'Revert to Draft'}
            </Button>
          </>
        )}
        {quote.status === 'rejected' && (
          <Button size="sm" variant="outline" onClick={revertToDraft} disabled={actionLoading === 'revert'}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {actionLoading === 'revert' ? 'Reverting…' : 'Revert to Draft'}
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
                    <td className="p-3 text-right">
                      {isDraft ? (
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          value={lineEdits[item.id]?.quantity ?? ''}
                          onChange={e => setLineEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], quantity: e.target.value } }))}
                          onBlur={() => commitLineEdit(item)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-20 h-8 text-right ml-auto"
                        />
                      ) : (
                        parseFloat(item.quantity ?? '1')
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {isDraft ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineEdits[item.id]?.unitPrice ?? ''}
                          onChange={e => setLineEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], unitPrice: e.target.value } }))}
                          onBlur={() => commitLineEdit(item)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-28 h-8 text-right ml-auto"
                        />
                      ) : (
                        formatCents(item.unitPriceCents)
                      )}
                      {item.listUnitPriceCents != null && item.listUnitPriceCents > item.unitPriceCents && (
                        <div className="text-xs mt-1 text-muted-foreground">
                          <span className="line-through">{formatCents(item.listUnitPriceCents)}</span>
                          {' '}list · saves {formatCents(item.listUnitPriceCents - item.unitPriceCents)}/unit
                        </div>
                      )}
                      {(() => {
                        const m = marginInfo(item, isDraft ? lineEdits[item.id]?.unitPrice : undefined);
                        return m ? (
                          <div className={`text-xs mt-1 ${m.under ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            {m.label}{m.under ? ' — below cost' : ''}
                          </div>
                        ) : null;
                      })()}
                    </td>
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

      {/* E-Signature / Delivery Status */}
      {(signature || agreement || quote.declineReason) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">E-Signature &amp; Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {signature && (
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-28">Sent to</span>
                  <span>{signature.recipientEmail}</span>
                  <Badge variant="outline" className="text-xs">{signature.status}</Badge>
                </div>
                {signature.viewedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-28">Viewed</span>
                    <span>{new Date(signature.viewedAt).toLocaleString()}</span>
                  </div>
                )}
                {(signature.status === 'pending' || signature.status === 'viewed') && (
                  <div className="flex items-center gap-2 flex-wrap pt-2">
                    <Button size="sm" variant="outline" onClick={() => setShowSendDialog(true)}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Resend
                    </Button>
                    <Button size="sm" variant="outline" onClick={voidSignature}
                      disabled={actionLoading === 'voidSig'}
                      className="text-red-600 hover:text-red-700 dark:text-red-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      {actionLoading === 'voidSig' ? 'Cancelling…' : 'Cancel request'}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {signatureMessage || 'Waiting for the recipient to sign.'}
                    </span>
                  </div>
                )}
                {signature.status === 'signed' && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28">Signed by</span>
                      <span className="font-medium">{signature.signerName}</span>
                      {signature.signerEmail && <span className="text-muted-foreground">({signature.signerEmail})</span>}
                    </div>
                    {signature.signerPhone && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-28">Phone</span>
                        <span>{signature.signerPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28">Signed at</span>
                      <span>{signature.signedAt ? new Date(signature.signedAt).toLocaleString() : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28">IP address</span>
                      <span className="font-mono text-xs">{signature.ipAddress}</span>
                    </div>
                    <div className="pt-1">
                      <Button size="sm" variant="outline" onClick={async () => {
                        const { token } = await api<{ token: string }>(`/quotes/${quoteId}/preview-token`, { method: 'POST' });
                        window.open(`/api/v1/quotes/${quoteId}/signed-pdf?token=${token}`, '_blank');
                      }}>
                        <FileText className="h-3 w-3 mr-1" /> View Signed Quote PDF
                      </Button>
                    </div>
                  </>
                )}
                {signature.status === 'declined' && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-28">Declined</span>
                    <span>{signature.declinedAt ? new Date(signature.declinedAt).toLocaleString() : ''}</span>
                  </div>
                )}
              </div>
            )}
            {quote.declineReason && (
              <div className="text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded-md border border-red-200 dark:border-red-800">
                <span className="font-medium">Decline reason:</span> {quote.declineReason}
              </div>
            )}
            {agreement && (
              <div className="border-t pt-3 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{agreement.title}</span>
                  <Badge
                    variant={agreement.status === 'signed' ? 'default' : agreement.status === 'declined' ? 'destructive' : 'secondary'}
                    className={agreement.status === 'signed' ? 'bg-green-600 hover:bg-green-600/80' : ''}
                  >
                    {agreement.status}
                  </Badge>
                  {agreement.signedAt && (
                    <span className="text-muted-foreground">signed {new Date(agreement.signedAt).toLocaleString()}</span>
                  )}
                  <Button size="sm" variant="outline" onClick={async () => {
                    const { token } = await api<{ token: string }>(`/agreements/${agreement.id}/preview-token`, { method: 'POST' });
                    window.open(`/api/v1/agreements/${agreement.id}/pdf?token=${token}`, '_blank');
                  }}>
                    <FileText className="h-3 w-3 mr-1" /> View PDF
                  </Button>
                  {agreement.signature?.verificationSessionId && (
                    <Badge
                      variant={agreement.signature.verificationStatus === 'verified' ? 'default' : 'secondary'}
                      className={agreement.signature.verificationStatus === 'verified' ? 'bg-green-600 hover:bg-green-600/80' : ''}
                      title={`Stripe Identity session ${agreement.signature.verificationSessionId}`}
                    >
                      ID: {agreement.signature.verificationStatus === 'verified' ? 'verified'
                        : agreement.signature.verificationStatus === 'processing' ? 'verifying…'
                        : agreement.signature.verificationStatus ?? 'not started'}
                    </Badge>
                  )}
                  {agreement.hasIdDocument && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      const { token } = await api<{ token: string }>(`/agreements/${agreement.id}/preview-token`, { method: 'POST' });
                      window.open(`/api/v1/agreements/${agreement.id}/id-document?token=${token}`, '_blank');
                    }}>
                      View ID
                    </Button>
                  )}
                </div>
                {agreement.status !== 'signed' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={agreementResendTo}
                      onChange={e => setAgreementResendTo(e.target.value)}
                      placeholder={signature?.signerEmail || signature?.recipientEmail || 'customer@company.com'}
                      className="w-64 h-8"
                    />
                    <Button size="sm" variant="outline" onClick={resendAgreement}
                      disabled={actionLoading === 'resendAgreement' || !agreementResendTo}>
                      <Send className="h-3 w-3 mr-1" />
                      {actionLoading === 'resendAgreement' ? 'Sending…' : 'Resend MSA'}
                    </Button>
                    {agreementMessage && <span className="text-xs text-muted-foreground">{agreementMessage}</span>}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send / Resend Dialog */}
      <SendQuoteDialog
        quoteId={quoteId}
        quoteNumber={quote.quoteNumber}
        isResend={!isDraft}
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        onSent={reload}
      />

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
                <Combobox
                  options={[
                    {value: 'recurring', label: 'Recurring'},
                    {value: 'per_device', label: 'Per Device'},
                    {value: 'per_user', label: 'Per User'},
                    {value: 'one_time', label: 'One Time'},
                  ]}
                  value={itemForm.itemType}
                  onValueChange={(v) => setItemForm({ ...itemForm, itemType: v })}
                  placeholder="Select type..."
                />
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
            <div className="grid grid-cols-3 gap-3">
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
              <div className="space-y-2">
                <Label>List Price ($) <span className="text-muted-foreground font-normal">— optional, shows savings</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="20.00"
                  value={itemForm.listUnitPriceCents}
                  onChange={e => setItemForm({ ...itemForm, listUnitPriceCents: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost ($) <span className="text-muted-foreground font-normal">— internal only</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="10.00"
                  value={itemForm.unitCostCents}
                  onChange={e => setItemForm({ ...itemForm, unitCostCents: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center">
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
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="catalog-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="catalog-search"
                  autoFocus
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Search by name, category, or type..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-qty">Quantity</Label>
              <Input id="catalog-qty" type="number" min="1" value={catalogQty} onChange={e => setCatalogQty(e.target.value)} className="w-24" />
            </div>
          </div>
          {catalogItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No catalog items yet. Add items in Settings to use them here.
            </div>
          ) : filteredCatalogItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No catalog items match "{catalogSearch}".
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                filteredCatalogItems.reduce<Record<string, CatalogItem[]>>((acc, item) => {
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
                          Price: {formatCents(item.defaultUnitPriceCents)}
                          {item.defaultUnitCostCents != null && ` | Cost: ${formatCents(item.defaultUnitCostCents)}`}
                          {' | '}{item.itemType.replace(/_/g, ' ')}
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
              <Combobox
                options={[
                  {value: 'contract', label: 'Contract'},
                  {value: 'invoice', label: 'Invoice'},
                ]}
                value={convertTo}
                onValueChange={(v) => setConvertTo(v as 'contract' | 'invoice')}
                placeholder="Select..."
              />
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
