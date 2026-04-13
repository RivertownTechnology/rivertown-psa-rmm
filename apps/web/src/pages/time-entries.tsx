import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, DollarSign, CheckCircle, AlertCircle, FileText, Gauge } from 'lucide-react';

interface TimeEntry {
  id: string; ticketId: string; ticketNumber: number; ticketSubject: string;
  customerId: string; userId: string; startedAt: string; endedAt: string | null;
  durationMinutes: number | null; isBillable: boolean; isBilled: boolean;
  rateCents: number | null; notes: string | null; createdAt: string;
  classification: 'covered' | 'billable' | 'overage' | 'internal';
  internalCategory: string | null;
  nonBillableReason: string | null;
  billableCents: number | null;
  costCents: number | null;
  contractLineItemId: string | null;
}

interface Customer { id: string; name: string; }

interface BillingBatchPreview {
  customerId: string;
  customerName: string;
  entryCount: number;
  totalMinutes: number;
  totalBillableCents: number;
  groups: Array<{
    ticketId: string; ticketNumber: number; ticketSubject: string;
    classification: string; rateCents: number;
    totalMinutes: number; totalBillableCents: number;
  }>;
}

interface BurnRow {
  lineItemId: string;
  description: string;
  contractId: string;
  contractName: string;
  customerId: string;
  customerName: string;
  totalHours: number;
  usedHours: number;
  remainingHours: number;
  pctUsed: number;
  resetCadence: string | null;
  periodStartDate: string | null;
  expiresAt: string | null;
  last30DaysHours: number;
  nearThreshold: boolean;
}

export function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [burn, setBurn] = useState<BurnRow[]>([]);
  const [preview, setPreview] = useState<BillingBatchPreview | null>(null);
  const [previewCustomerId, setPreviewCustomerId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const reload = useCallback(() => {
    Promise.all([
      api<TimeEntry[]>('/time-entries'),
      api<{ data: Customer[] }>('/customers?limit=500'),
      api<{ rows: BurnRow[] }>('/reports/block-hours'),
    ]).then(([e, c, b]) => {
      setEntries(e);
      setCustomers(c.data);
      setBurn(b.rows);
    }).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  // Per-customer unbilled rollup drives the billing-batch buttons.
  const unbilledByCustomer = useMemo(() => {
    const map = new Map<string, { minutes: number; billableCents: number; entries: number }>();
    for (const e of entries) {
      if (e.isBilled) continue;
      if (e.classification !== 'billable' && e.classification !== 'overage') continue;
      const cur = map.get(e.customerId) ?? { minutes: 0, billableCents: 0, entries: 0 };
      cur.minutes += e.durationMinutes ?? 0;
      cur.billableCents += e.billableCents ?? 0;
      cur.entries += 1;
      map.set(e.customerId, cur);
    }
    return Array.from(map.entries())
      .map(([customerId, v]) => ({ customerId, customerName: customerMap.get(customerId) ?? 'Unknown', ...v }))
      .sort((a, b) => b.billableCents - a.billableCents);
  }, [entries, customerMap]);

  const totalMinutes = entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const billableMinutes = entries
    .filter((e) => e.classification === 'billable' || e.classification === 'overage')
    .reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const internalMinutes = entries
    .filter((e) => e.classification === 'internal')
    .reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const unbilledRevenue = entries
    .filter((e) => !e.isBilled && (e.classification === 'billable' || e.classification === 'overage'))
    .reduce((s, e) => s + (e.billableCents ?? 0), 0);

  async function previewBatch(customerId: string) {
    setBatchError(null);
    setPreviewCustomerId(customerId);
    try {
      const data = await api<BillingBatchPreview>(`/customers/${customerId}/billing-batch/preview`);
      setPreview(data);
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : 'Failed to load preview.');
    }
  }

  async function generateBatch(customerId: string) {
    setBatchError(null);
    setGenerating(true);
    try {
      const res = await api<{ invoiceId: string | null; entryCount: number }>(`/customers/${customerId}/billing-batch`, { method: 'POST' });
      if (res.invoiceId) {
        window.location.href = `/billing/invoices/${res.invoiceId}`;
      } else {
        setBatchError('Nothing to bill for this customer.');
      }
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : 'Failed to generate invoice.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Hours</span><Clock className="h-4 w-4 text-muted-foreground" /></div>
          <div className="text-2xl font-bold mt-1">{(totalMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Billable + Overage</span><DollarSign className="h-4 w-4 text-green-600" /></div>
          <div className="text-2xl font-bold mt-1 text-green-600">{(billableMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Internal</span><CheckCircle className="h-4 w-4 text-muted-foreground" /></div>
          <div className="text-2xl font-bold mt-1">{(internalMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Unbilled Revenue</span><AlertCircle className="h-4 w-4 text-orange-500" /></div>
          <div className="text-2xl font-bold mt-1 text-orange-500">{formatCents(unbilledRevenue)}</div>
        </CardContent></Card>
      </div>

      {/* Billing-batch generator: one card per customer with unbilled billable/overage time. */}
      {unbilledByCustomer.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Ready to bill
              <span className="text-xs font-normal text-muted-foreground">
                ({unbilledByCustomer.length} customer{unbilledByCustomer.length === 1 ? '' : 's'})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {batchError && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{batchError}</div>
            )}
            <div className="divide-y">
              {unbilledByCustomer.map((row) => (
                <div key={row.customerId} className="flex items-center justify-between py-2 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{row.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.entries} {row.entries === 1 ? 'entry' : 'entries'} · {(row.minutes / 60).toFixed(1)}h · {formatCents(row.billableCents)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => previewBatch(row.customerId)}>Preview</Button>
                    <Button size="sm" onClick={() => generateBatch(row.customerId)} disabled={generating}>
                      {generating ? 'Generating...' : 'Generate invoice'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {preview && (
              <div className="mt-3 rounded border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Preview: {preview.customerName}</div>
                  <button className="text-xs text-muted-foreground" onClick={() => { setPreview(null); setPreviewCustomerId(null); }}>close</button>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {preview.entryCount} entries · {(preview.totalMinutes / 60).toFixed(1)}h · {formatCents(preview.totalBillableCents)}
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="text-left py-1">Ticket</th><th className="text-left py-1">Kind</th><th className="text-right py-1">Hours</th><th className="text-right py-1">Rate</th><th className="text-right py-1">Amount</th></tr></thead>
                  <tbody>
                    {preview.groups.map((g, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1">#{g.ticketNumber} — {g.ticketSubject}</td>
                        <td className="py-1 capitalize">{g.classification}</td>
                        <td className="py-1 text-right">{(g.totalMinutes / 60).toFixed(2)}</td>
                        <td className="py-1 text-right">{formatCents(g.rateCents)}/hr</td>
                        <td className="py-1 text-right">{formatCents(g.totalBillableCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewCustomerId && (
                  <div className="flex justify-end mt-2">
                    <Button size="sm" onClick={() => generateBatch(previewCustomerId)} disabled={generating}>
                      {generating ? 'Generating...' : 'Generate invoice'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Block Hour Burn — active block lines, worst-first */}
      {burn.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Block Hours Burn
              <span className="text-xs font-normal text-muted-foreground">({burn.length} active)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Contract / Line</th>
                <th className="text-right p-3 font-medium">Used</th>
                <th className="text-right p-3 font-medium">Remaining</th>
                <th className="text-right p-3 font-medium">30d</th>
                <th className="text-left p-3 font-medium">Period / Expires</th>
              </tr></thead>
              <tbody>
                {burn.map((r) => (
                  <tr key={r.lineItemId} className={`border-b ${r.nearThreshold ? 'bg-amber-50' : ''} ${r.remainingHours <= 0 ? 'bg-red-50' : ''}`}>
                    <td className="p-3">{r.customerName}</td>
                    <td className="p-3 text-muted-foreground">{r.contractName} — {r.description}</td>
                    <td className="p-3 text-right">{r.usedHours.toFixed(1)} / {r.totalHours.toFixed(1)}h ({r.pctUsed}%)</td>
                    <td className={`p-3 text-right font-medium ${r.remainingHours <= 0 ? 'text-red-700' : r.nearThreshold ? 'text-amber-700' : ''}`}>
                      {r.remainingHours.toFixed(1)}h
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{r.last30DaysHours.toFixed(1)}h</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.resetCadence && r.periodStartDate ? `Resets ${r.resetCadence}, started ${r.periodStartDate}` : ''}
                      {r.expiresAt ? `Expires ${new Date(r.expiresAt).toLocaleDateString()}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Time entries table */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Time Entries ({entries.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Date</th>
              <th className="text-left p-3 font-medium">Ticket</th>
              <th className="text-left p-3 font-medium">Customer</th>
              <th className="text-right p-3 font-medium">Duration</th>
              <th className="text-left p-3 font-medium">Notes</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Amount</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => {
                const hours = (e.durationMinutes ?? 0) / 60;
                return (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{new Date(e.startedAt).toLocaleDateString()}</td>
                    <td className="p-3"><span className="text-primary font-medium">#{e.ticketNumber}</span> {e.ticketSubject}</td>
                    <td className="p-3 text-muted-foreground">{customerMap.get(e.customerId) ?? '-'}</td>
                    <td className="p-3 text-right">{e.durationMinutes ? `${hours.toFixed(1)}h` : '-'}</td>
                    <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                      {e.notes ?? '-'}
                      {e.nonBillableReason === 'communication' && <Badge variant="outline" className="ml-2 text-[10px]">comms</Badge>}
                    </td>
                    <td className="p-3">
                      <ClassificationPill entry={e} />
                      {e.isBilled && <Badge variant="outline" className="ml-1 text-xs">Billed</Badge>}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {e.billableCents && e.billableCents > 0 ? formatCents(e.billableCents) : '—'}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No time entries yet. Log time from ticket detail pages.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassificationPill({ entry }: { entry: TimeEntry }) {
  switch (entry.classification) {
    case 'covered':
      return entry.nonBillableReason === 'communication'
        ? <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Comms</Badge>
        : <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">Covered</Badge>;
    case 'billable':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Billable</Badge>;
    case 'overage':
      return <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">Overage</Badge>;
    case 'internal':
      return <Badge variant="outline">Internal</Badge>;
    default:
      return <Badge variant="secondary">{entry.classification}</Badge>;
  }
}
