import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';

interface TimeEntry {
  id: string; ticketId: string; ticketNumber: number; ticketSubject: string;
  customerId: string; userId: string; startedAt: string; endedAt: string | null;
  durationMinutes: number | null; isBillable: boolean; isBilled: boolean;
  rateCents: number | null; notes: string | null; createdAt: string;
}

interface Customer { id: string; name: string; }

export function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    Promise.all([
      api<TimeEntry[]>('/time-entries'),
      api<{ data: Customer[] }>('/customers?limit=100'),
    ]).then(([e, c]) => {
      setEntries(e);
      setCustomers(c.data);
    }).catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));

  const totalMinutes = entries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const billableMinutes = entries.filter(e => e.isBillable).reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;
  const unbilledRevenue = entries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => {
    const hours = (e.durationMinutes ?? 0) / 60;
    return s + hours * (e.rateCents ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Hours</span><Clock className="h-4 w-4 text-muted-foreground" /></div>
          <div className="text-2xl font-bold mt-1">{(totalMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Billable Hours</span><DollarSign className="h-4 w-4 text-green-600" /></div>
          <div className="text-2xl font-bold mt-1 text-green-600">{(billableMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Non-Billable</span><CheckCircle className="h-4 w-4 text-muted-foreground" /></div>
          <div className="text-2xl font-bold mt-1">{(nonBillableMinutes / 60).toFixed(1)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Unbilled Revenue</span><AlertCircle className="h-4 w-4 text-orange-500" /></div>
          <div className="text-2xl font-bold mt-1 text-orange-500">{formatCents(Math.round(unbilledRevenue))}</div>
        </CardContent></Card>
      </div>

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
              <th className="text-right p-3 font-medium">Rate</th>
              <th className="text-right p-3 font-medium">Amount</th>
            </tr></thead>
            <tbody>
              {entries.map(e => {
                const hours = (e.durationMinutes ?? 0) / 60;
                const amount = e.isBillable ? hours * (e.rateCents ?? 0) : 0;
                return (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{new Date(e.startedAt).toLocaleDateString()}</td>
                    <td className="p-3"><span className="text-primary font-medium">#{e.ticketNumber}</span> {e.ticketSubject}</td>
                    <td className="p-3 text-muted-foreground">{customerMap.get(e.customerId) ?? '-'}</td>
                    <td className="p-3 text-right">{e.durationMinutes ? `${hours.toFixed(1)}h` : '-'}</td>
                    <td className="p-3 text-muted-foreground max-w-[200px] truncate">{e.notes ?? '-'}</td>
                    <td className="p-3">
                      {e.isBilled ? <Badge variant="secondary">Billed</Badge>
                        : e.isBillable ? <Badge variant="default">Billable</Badge>
                        : <Badge variant="outline">Covered</Badge>}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{e.rateCents ? formatCents(e.rateCents) + '/hr' : '-'}</td>
                    <td className="p-3 text-right font-medium">{amount > 0 ? formatCents(Math.round(amount)) : '-'}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No time entries yet. Log time from ticket detail pages.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
