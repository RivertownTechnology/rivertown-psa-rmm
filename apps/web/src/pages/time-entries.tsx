import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Clock, DollarSign, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';

interface TimeEntry {
  id: string; ticketId: string; ticketNumber: number; ticketSubject: string;
  customerId: string; userId: string; startedAt: string; endedAt: string | null;
  durationMinutes: number | null; isBillable: boolean; isBilled: boolean;
  rateCents: number | null; notes: string | null; createdAt: string;
}

interface Customer { id: string; name: string; }
interface Ticket { id: string; ticketNumber: number; subject: string; customerId: string; }
interface TicketsResponse { data: Ticket[]; pagination: { total: number; page: number; totalPages: number }; }

type DateFilter = 'today' | 'week' | 'month' | 'all';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isToday(date: Date, now: Date): boolean {
  return isSameDay(date, now);
}

function groupEntriesByDate(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const dateKey = new Date(entry.startedAt).toISOString().split('T')[0];
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(entry);
  }
  return groups;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Quick entry form state
  const [qTicketId, setQTicketId] = useState('');
  const [qHours, setQHours] = useState('');
  const [qMinutes, setQMinutes] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [qBillable, setQBillable] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<TimeEntry[]>('/time-entries'),
      api<{ data: Customer[] }>('/customers?limit=100'),
      api<TicketsResponse>('/tickets?limit=50'),
    ]).then(([e, c, t]) => {
      setEntries(e);
      setCustomers(c.data);
      setTickets(t.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));

  const ticketOptions = tickets.map(t => ({
    value: t.id,
    label: `#${t.ticketNumber} — ${t.subject}`,
  }));

  // Filtering
  const now = new Date();
  const filteredEntries = useMemo(() => {
    if (dateFilter === 'all') return entries;
    return entries.filter(e => {
      const d = new Date(e.startedAt);
      switch (dateFilter) {
        case 'today': return isSameDay(d, now);
        case 'week': return d >= startOfWeek(now);
        case 'month': return d >= startOfMonth(now);
        default: return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dateFilter]);

  // Stats
  const totalMinutes = filteredEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const billableMinutes = filteredEntries.filter(e => e.isBillable).reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;
  const unbilledRevenue = filteredEntries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => {
    const hours = (e.durationMinutes ?? 0) / 60;
    return s + hours * (e.rateCents ?? 0);
  }, 0);

  // Date-grouped entries (sorted newest first)
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [filteredEntries]);

  const grouped = useMemo(() => groupEntriesByDate(sortedEntries), [sortedEntries]);

  const sortedDateKeys = useMemo(() => {
    return Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  }, [grouped]);

  // Quick entry submit
  async function handleQuickEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!qTicketId) return;
    const totalMins = (parseInt(qHours || '0', 10) * 60) + parseInt(qMinutes || '0', 10);
    if (totalMins <= 0) return;

    setSubmitting(true);
    try {
      const startedAt = new Date().toISOString();
      const endedAt = new Date(Date.now() + totalMins * 60000).toISOString();
      await api(`/tickets/${qTicketId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt,
          endedAt,
          durationMinutes: totalMins,
          isBillable: qBillable,
          notes: qNotes || undefined,
        }),
      });
      // Reload entries
      const updated = await api<TimeEntry[]>('/time-entries');
      setEntries(updated);
      // Reset form
      setQTicketId('');
      setQHours('');
      setQMinutes('');
      setQNotes('');
      setQBillable(true);
      setShowQuickEntry(false);
    } catch {
      // Error handled by api layer
    } finally {
      setSubmitting(false);
    }
  }

  function dateSectionLabel(dateKey: string): string {
    const date = new Date(dateKey + 'T00:00:00');
    if (isToday(date, now)) return `Today (${formatDate(date)})`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(date, yesterday)) return `Yesterday (${formatDate(date)})`;
    return formatDate(date);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </CardContent></Card>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick Entry Toggle */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setShowQuickEntry(!showQuickEntry)}>
          {showQuickEntry ? <ChevronUp className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showQuickEntry ? 'Hide Quick Entry' : 'Log Time'}
        </Button>
      </div>

      {/* Quick Entry Form */}
      {showQuickEntry && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleQuickEntry} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label className="text-xs text-muted-foreground">Ticket</Label>
                <Combobox
                  options={ticketOptions}
                  value={qTicketId}
                  onValueChange={setQTicketId}
                  placeholder="Select ticket..."
                  searchPlaceholder="Search tickets..."
                  emptyText="No tickets found."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hours</Label>
                <Input
                  type="number"
                  min="0"
                  value={qHours}
                  onChange={e => setQHours(e.target.value)}
                  placeholder="0"
                  className="w-16"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Min</Label>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={qMinutes}
                  onChange={e => setQMinutes(e.target.value)}
                  placeholder="0"
                  className="w-16"
                />
              </div>
              <div className="flex-1 min-w-[150px] space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Input
                  value={qNotes}
                  onChange={e => setQNotes(e.target.value)}
                  placeholder="What did you work on?"
                />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <input
                  type="checkbox"
                  id="qBillable"
                  checked={qBillable}
                  onChange={e => setQBillable(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="qBillable" className="text-sm cursor-pointer">Billable</Label>
              </div>
              <Button type="submit" size="sm" disabled={submitting || !qTicketId}>
                {submitting ? 'Saving...' : 'Log'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
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

      {/* Date Range Filter */}
      <div className="flex items-center gap-2">
        {([['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All']] as const).map(([key, label]) => (
          <Button
            key={key}
            variant={dateFilter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilter(key)}
          >
            {label}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground ml-2">
          {filteredEntries.length} entries
        </span>
      </div>

      {/* Date-Grouped Entries */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No time entries"
          description="Log time from ticket detail pages or use the quick entry form above."
          action={{ label: 'Log Time', onClick: () => setShowQuickEntry(true) }}
        />
      ) : (
        <div className="space-y-4">
          {sortedDateKeys.map(dateKey => {
            const dayEntries = grouped.get(dateKey)!;
            const dayTotal = dayEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);

            return (
              <div key={dateKey}>
                {/* Day Header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {dateSectionLabel(dateKey)}
                  </h3>
                  <span className="text-sm font-medium text-muted-foreground">
                    {(dayTotal / 60).toFixed(1)}h
                  </span>
                </div>

                {/* Day Entries */}
                <div className="space-y-1">
                  {dayEntries.map(entry => {
                    const hours = (entry.durationMinutes ?? 0) / 60;
                    const amount = entry.isBillable ? hours * (entry.rateCents ?? 0) : 0;

                    return (
                      <Card key={entry.id} className="hover:bg-muted/30 transition-colors">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-primary">#{entry.ticketNumber}</span>
                                <span className="text-sm truncate">{entry.ticketSubject}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {customerMap.get(entry.customerId) ?? '-'}
                                </span>
                                {entry.notes && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                    {entry.notes}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-medium tabular-nums">
                                {entry.durationMinutes ? formatDuration(entry.durationMinutes) : '-'}
                              </span>
                              {entry.isBilled ? (
                                <Badge variant="secondary" className="text-xs">Billed</Badge>
                              ) : entry.isBillable ? (
                                <Badge variant="default" className="text-xs">Billable</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Covered</Badge>
                              )}
                              {amount > 0 && (
                                <span className="text-sm font-medium tabular-nums w-20 text-right">
                                  {formatCents(Math.round(amount))}
                                </span>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
