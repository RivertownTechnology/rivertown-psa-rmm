import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Plus, DollarSign, Send, Trash2, CreditCard, XCircle, Pencil, FileText,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

interface Invoice {
  id: string; invoiceNumber: number; customerId: string; status: string;
  issueDate: string; dueDate: string; subtotalCents: number; taxCents: number;
  totalCents: number; amountPaidCents: number; creditsAppliedCents: number; notes: string | null;
  createdAt: string; updatedAt: string;
  lineItems: { id: string; description: string; quantity: string | null; unitPriceCents: number; totalCents: number; sortOrder: number | null; createdAt: string }[];
  payments: { id: string; amountCents: number; paymentMethod: string; reference: string | null; paidAt: string }[];
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline', sent: 'default', paid: 'secondary', overdue: 'destructive', void: 'secondary', cancelled: 'destructive',
};
const statusClass: Record<string, string> = { paid: 'bg-green-600 hover:bg-green-600/80' };

export function InvoiceDetailPage({ invoiceId, onBack, onNavigateToCustomer }: {
  invoiceId: string; onBack: () => void; onNavigateToCustomer: (id: string) => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Notes editing (draft only)
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesForm, setNotesForm] = useState({ notes: '', internalNote: '', customerNote: '' });

  // Add line item
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ description: '', unitPriceCents: '', quantity: '1', catalogItemId: '' });
  const [catalogItems, setCatalogItems] = useState<Array<{ id: string; name: string; description: string | null; defaultUnitPriceCents: number; category: string }>>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  // Record payment
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amountCents: '', paymentMethod: 'manual', reference: '' });

  // Cancel dialog
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCustomerNote, setCancelCustomerNote] = useState('');

  // Credit confirm dialog
  const [creditConfirm, setCreditConfirm] = useState<{open: boolean, id: string, amount: string}>({open: false, id: '', amount: ''});

  const loadInvoice = useCallback(async () => {
    const data = await api<Invoice>(`/invoices/${invoiceId}`);
    setInvoice(data);
    setNotesForm({ notes: data.notes ?? '', internalNote: '', customerNote: '' });
    try {
      const cust = await api<{ name: string }>(`/customers/${data.customerId}`);
      setCustomerName(cust.name);
    } catch { /* */ }
  }, [invoiceId]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  async function saveNotes() {
    setSaving(true);
    try {
      await api(`/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ notes: notesForm.notes }) });
      setEditingNotes(false);
      await loadInvoice();
    } finally { setSaving(false); }
  }

  async function sendInvoice() {
    setSaving(true); setMessage('');
    try {
      await api(`/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
      // Trigger email send
      try {
        await api(`/invoices/${invoiceId}/send-email`, { method: 'POST' });
        setMessage('Invoice sent and emailed to customer');
      } catch {
        setMessage('Invoice marked as sent (email delivery failed)');
      }
      await loadInvoice();
    } finally { setSaving(false); }
  }

  async function resendInvoice() {
    setSaving(true); setMessage('');
    try {
      await api(`/invoices/${invoiceId}/send-email`, { method: 'POST' });
      setMessage('Invoice resent to customer');
      await loadInvoice();
    } catch {
      setMessage('Failed to resend invoice email');
    } finally { setSaving(false); }
  }

  async function cancelInvoice() {
    if (!cancelReason.trim()) return;
    setSaving(true); setMessage('');
    try {
      const note = [
        invoice?.notes,
        `--- CANCELLED ---`,
        `Reason: ${cancelReason}`,
        cancelCustomerNote ? `Customer note: ${cancelCustomerNote}` : '',
      ].filter(Boolean).join('\n');

      await api(`/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'void', notes: note }) });
      setShowCancel(false);
      setCancelReason('');
      setCancelCustomerNote('');
      setMessage('Invoice cancelled. Cancellation email will be sent to the customer.');
      await loadInvoice();
    } finally { setSaving(false); }
  }

  async function addLineItem(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/invoices/${invoiceId}/line-items`, {
        method: 'POST',
        body: JSON.stringify({
          description: itemForm.description,
          unitPriceCents: Math.round(parseFloat(itemForm.unitPriceCents) * 100),
          quantity: itemForm.quantity,
          ...(itemForm.catalogItemId ? { catalogItemId: itemForm.catalogItemId } : {}),
        }),
      });
      setShowAddItem(false);
      setItemForm({ description: '', unitPriceCents: '', quantity: '1', catalogItemId: '' });
      await loadInvoice();
    } finally { setSaving(false); }
  }

  async function deleteLineItem(lineId: string) {
    await api(`/invoices/${invoiceId}/line-items/${lineId}`, { method: 'DELETE' });
    await loadInvoice();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/invoices/${invoiceId}/record-payment`, {
        method: 'POST',
        body: JSON.stringify({ amountCents: Math.round(parseFloat(paymentForm.amountCents) * 100), paymentMethod: paymentForm.paymentMethod, reference: paymentForm.reference || undefined }),
      });
      setShowPayment(false);
      setPaymentForm({ amountCents: '', paymentMethod: 'manual', reference: '' });
      await loadInvoice();
    } finally { setSaving(false); }
  }

  if (!invoice) {
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

  const isDraft = invoice.status === 'draft';
  const isEditable = isDraft;
  const isCancellable = ['sent', 'overdue', 'partial'].includes(invoice.status);
  const canRecordPayment = !['paid', 'void', 'cancelled'].includes(invoice.status);
  const balanceCents = invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Invoices', href: '/billing/invoices' }, { label: `INV-${invoice.invoiceNumber}` }]} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h2 className="text-xl font-semibold">Invoice INV-{invoice.invoiceNumber}</h2>
          <Badge variant={statusVariant[invoice.status] ?? 'secondary'} className={statusClass[invoice.status] ?? ''}>
            {invoice.status === 'void' ? 'Cancelled' : invoice.status}
          </Badge>
          <span className="text-sm text-muted-foreground">|</span>
          <button className="text-sm text-primary hover:underline" onClick={() => onNavigateToCustomer(invoice.customerId)}>{customerName}</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <Button size="sm" onClick={sendInvoice} disabled={saving}><Send className="h-4 w-4 mr-1" />Send Invoice</Button>
          )}
          {isDraft && (
            <Button size="sm" variant="outline" onClick={async () => {
              await api(`/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
              loadInvoice();
            }}>Mark Sent</Button>
          )}
          {['sent', 'overdue', 'partial', 'viewed'].includes(invoice.status) && (
            <Button size="sm" variant="outline" onClick={resendInvoice} disabled={saving}><Send className="h-4 w-4 mr-1" />Resend</Button>
          )}
          {isCancellable && (
            <Button size="sm" variant="destructive" onClick={() => setShowCancel(true)}><XCircle className="h-4 w-4 mr-1" />Cancel Invoice</Button>
          )}
          {!['cancelled', 'void'].includes(invoice.status) && invoice.totalCents > 0 && (
            <Button size="sm" variant="outline" onClick={() => {
              setCreditConfirm({open: true, id: invoiceId, amount: (invoice.totalCents / 100).toFixed(2)});
            }}>Credit to Account</Button>
          )}
          {balanceCents > 0 && !['paid', 'cancelled', 'void'].includes(invoice.status) && (
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const res = await api<{ applied: number; remainingCredit: number; message?: string }>(`/invoices/${invoiceId}/apply-credit`, { method: 'POST', body: JSON.stringify({}) });
                if (res.applied > 0) {
                  setMessage(`Applied $${(res.applied / 100).toFixed(2)} credit. Remaining credit: $${(res.remainingCredit / 100).toFixed(2)}`);
                  loadInvoice();
                } else {
                  setMessage(res.message || 'No credit available to apply');
                }
              } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); }
            }}>Apply Credit</Button>
          )}
          {canRecordPayment && (
            <Button size="sm" variant="outline" onClick={() => {
              const rem = balanceCents / 100;
              setPaymentForm({ amountCents: rem > 0 ? rem.toFixed(2) : '', paymentMethod: 'manual', reference: '' });
              setShowPayment(true);
            }}><CreditCard className="h-4 w-4 mr-1" />Record Payment</Button>
          )}
          <Button variant="outline" size="sm" onClick={async () => {
            const { token } = await api<{ token: string }>(`/invoices/${invoiceId}/preview-token`, { method: 'POST' });
            window.open(`/api/v1/invoices/${invoiceId}/html?token=${token}`, '_blank');
          }}><FileText className="h-4 w-4 mr-1" />Export PDF</Button>
        </div>
      </div>

      {message && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">{message}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Subtotal</div><div className="text-2xl font-bold mt-1">{formatCents(invoice.subtotalCents)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Tax</div><div className="text-2xl font-bold mt-1">{formatCents(invoice.taxCents)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total</div><div className="text-2xl font-bold text-green-600 mt-1">{formatCents(invoice.totalCents)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Paid</div><div className="text-2xl font-bold mt-1">{formatCents(invoice.amountPaidCents + (invoice.creditsAppliedCents ?? 0))}</div>{(invoice.creditsAppliedCents ?? 0) > 0 && <div className="text-xs text-muted-foreground">(incl. {formatCents(invoice.creditsAppliedCents)} credit)</div>}</CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Balance</div><div className={`text-2xl font-bold mt-1 ${balanceCents > 0 ? 'text-orange-500' : 'text-green-600'}`}>{formatCents(balanceCents)}</div></CardContent></Card>
      </div>

      {/* Dates & Notes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-6 text-sm">
            <span>Issue Date: <strong>{invoice.issueDate}</strong></span>
            <span>Due Date: <strong>{invoice.dueDate}</strong></span>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-medium">Notes</Label>
              {isEditable && !editingNotes && (
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea rows={3} value={notesForm.notes} onChange={e => setNotesForm({ ...notesForm, notes: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Invoice notes (visible on PDF)..." />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveNotes} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingNotes(false); setNotesForm(f => ({ ...f, notes: invoice.notes ?? '' })); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes || 'No notes'}</p>
            )}
          </div>
          {!isEditable && invoice.notes && invoice.notes.includes('CANCELLED') && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md whitespace-pre-wrap">{invoice.notes}</div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="line-items">
        <TabsList>
          <TabsTrigger value="line-items">Line Items ({invoice.lineItems.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({invoice.payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="line-items">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                {isEditable && <Button size="sm" onClick={() => setShowAddItem(true)}><Plus className="h-4 w-4 mr-1" />Add Line Item</Button>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-right p-3 font-medium">Qty</th>
                  <th className="text-right p-3 font-medium">Unit Price</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  {isEditable && <th className="w-10"></th>}
                </tr></thead>
                <tbody>
                  {invoice.lineItems.map(item => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{item.description}</td>
                      <td className="p-3 text-right">{parseFloat(item.quantity ?? '1')}</td>
                      <td className="p-3 text-right">{formatCents(item.unitPriceCents)}</td>
                      <td className="p-3 text-right font-medium">{formatCents(item.totalCents)}</td>
                      {isEditable && <td className="p-3"><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteLineItem(item.id)}><Trash2 className="h-3 w-3" /></Button></td>}
                    </tr>
                  ))}
                  {invoice.lineItems.length === 0 && <tr><td colSpan={isEditable ? 5 : 4} className="p-8 text-center text-muted-foreground">No line items</td></tr>}
                </tbody>
                {invoice.lineItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30"><td colSpan={isEditable ? 3 : 2} className="p-3 text-right font-medium">Subtotal</td><td className="p-3 text-right font-medium">{formatCents(invoice.subtotalCents)}</td>{isEditable && <td />}</tr>
                    <tr className="bg-muted/30"><td colSpan={isEditable ? 3 : 2} className="p-3 text-right text-muted-foreground">Tax</td><td className="p-3 text-right text-muted-foreground">{formatCents(invoice.taxCents)}</td>{isEditable && <td />}</tr>
                    <tr className="bg-muted/30 border-t"><td colSpan={isEditable ? 3 : 2} className="p-3 text-right font-semibold text-green-600">Total</td><td className="p-3 text-right font-semibold text-green-600">{formatCents(invoice.totalCents)}</td>{isEditable && <td />}</tr>
                  </tfoot>
                )}
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Payments</CardTitle>
                {canRecordPayment && <Button size="sm" onClick={() => { setPaymentForm({ amountCents: (balanceCents / 100).toFixed(2), paymentMethod: 'manual', reference: '' }); setShowPayment(true); }}><CreditCard className="h-4 w-4 mr-1" />Record Payment</Button>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Method</th>
                  <th className="text-left p-3 font-medium">Reference</th>
                </tr></thead>
                <tbody>
                  {invoice.payments.map(p => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="p-3 text-right font-medium text-green-600">{formatCents(p.amountCents)}</td>
                      <td className="p-3"><Badge variant="outline">{p.paymentMethod}</Badge></td>
                      <td className="p-3 text-muted-foreground">{p.reference ?? '-'}</td>
                    </tr>
                  ))}
                  {invoice.payments.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No payments</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Line Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={(open) => { setShowAddItem(open); if (open) { setShowCatalog(false); api<typeof catalogItems>('/service-catalog').then(setCatalogItems).catch(() => {}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>

          {showCatalog ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Select an item from the product catalog</p>
                <Button size="sm" variant="ghost" onClick={() => setShowCatalog(false)}>Back to manual</Button>
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {catalogItems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No catalog items found</div>
                ) : catalogItems.map(item => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between"
                    onClick={() => {
                      setItemForm({
                        description: item.description || item.name,
                        unitPriceCents: (item.defaultUnitPriceCents / 100).toFixed(2),
                        quantity: '1',
                        catalogItemId: item.id,
                      });
                      setShowCatalog(false);
                    }}
                  >
                    <div>
                      <div className="font-medium text-sm">{item.name}</div>
                      {item.description && item.description !== item.name && <div className="text-xs text-muted-foreground">{item.description}</div>}
                    </div>
                    <span className="text-sm font-medium">${(item.defaultUnitPriceCents / 100).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={addLineItem} className="space-y-4">
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCatalog(true)}>
                  <Plus className="h-3 w-3 mr-1" />From Catalog
                </Button>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input required value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Managed IT Services" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="1" step="0.01" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} /></div>
                <div className="space-y-2"><Label>Unit Price ($)</Label><Input type="number" step="0.01" min="0" required placeholder="100.00" value={itemForm.unitPriceCents} onChange={e => setItemForm({ ...itemForm, unitPriceCents: e.target.value })} /></div>
              </div>
              {itemForm.unitPriceCents && itemForm.quantity && (
                <div className="bg-muted p-3 rounded-md text-sm flex justify-between"><span>Line total:</span><span className="font-medium">${(parseFloat(itemForm.unitPriceCents) * parseFloat(itemForm.quantity)).toFixed(2)}</span></div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Line Item'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={recordPayment} className="space-y-4">
            <div className="space-y-2"><Label>Amount ($)</Label><Input type="number" step="0.01" min="0.01" required value={paymentForm.amountCents} onChange={e => setPaymentForm({ ...paymentForm, amountCents: e.target.value })} /></div>
            <div className="space-y-2"><Label>Payment Method</Label>
              <Combobox
                options={[
                  {value: 'manual', label: 'Manual'},
                  {value: 'check', label: 'Check'},
                  {value: 'stripe', label: 'Stripe'},
                  {value: 'qbo', label: 'QuickBooks'},
                ]}
                value={paymentForm.paymentMethod}
                onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}
                placeholder="Select method..."
              />
            </div>
            <div className="space-y-2"><Label>Reference (optional)</Label><Input value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Check #, transaction ID, etc." /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={creditConfirm.open}
        onOpenChange={(open) => setCreditConfirm(prev => ({...prev, open}))}
        title="Credit to Account"
        description={`Credit $${creditConfirm.amount} to the customer's account and cancel this invoice?`}
        confirmLabel="Credit"
        variant="destructive"
        onConfirm={async () => {
          try {
            const res = await api<{ credited: number; newBalance: number }>(`/invoices/${creditConfirm.id}/credit`, { method: 'POST', body: JSON.stringify({ reason: 'Invoice reversal' }) });
            setMessage(`Credited $${(res.credited / 100).toFixed(2)} to account. New credit balance: $${(res.newBalance / 100).toFixed(2)}`);
            setCreditConfirm({open: false, id: '', amount: ''});
            loadInvoice();
          } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); }
        }}
      />

      {/* Cancel Invoice Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Invoice INV-{invoice.invoiceNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cancelling this invoice will void it and notify the customer via email. This cannot be undone.
            </p>
            <div className="space-y-2">
              <Label>Cancel Reason (required, internal)</Label>
              <textarea rows={2} required value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Why is this invoice being cancelled?" />
            </div>
            <div className="space-y-2">
              <Label>Customer Note (optional, included in cancellation email)</Label>
              <textarea rows={2} value={cancelCustomerNote} onChange={e => setCancelCustomerNote(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Additional message for the customer..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Keep Invoice</Button>
            <Button variant="destructive" onClick={cancelInvoice} disabled={saving || !cancelReason.trim()}>
              <XCircle className="h-4 w-4 mr-1" />{saving ? 'Cancelling...' : 'Cancel Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
