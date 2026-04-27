import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

// ---------------------------------------------------------------------------
// Chart colors
// ---------------------------------------------------------------------------

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastMonthRange(): [string, string] {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = endDate.toISOString().slice(0, 10);
  return [start, end];
}

function startOfQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketsByDay { date: string; count: number }
interface SlaData { met: number; breached: number }
interface UtilizationEntry { techId: string; techName: string; hours: number }
interface RevenueEntry { customerId: string; customerName: string; mrr: number }
interface TimeEntryRow { techName: string; hours: number; entries: number }
interface AgingBucket { bucket: string; amount: number }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState('tickets');
  const [dateFrom, setDateFrom] = useState(startOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());

  // Ticket report
  const [ticketData, setTicketData] = useState<TicketsByDay[]>([]);
  const [ticketSummary, setTicketSummary] = useState({ created: 0, resolved: 0, open: 0 });
  const [ticketLoading, setTicketLoading] = useState(false);

  // SLA report
  const [slaData, setSlaData] = useState<SlaData>({ met: 0, breached: 0 });
  const [slaLoading, setSlaLoading] = useState(false);

  // Utilization report
  const [utilizationData, setUtilizationData] = useState<UtilizationEntry[]>([]);
  const [utilizationLoading, setUtilizationLoading] = useState(false);

  // Revenue report
  const [revenueData, setRevenueData] = useState<RevenueEntry[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Time report
  const [timeData, setTimeData] = useState<TimeEntryRow[]>([]);
  const [timeLoading, setTimeLoading] = useState(false);

  // Invoices report
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  const fetchTicketReport = useCallback(async () => {
    setTicketLoading(true);
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo });
      const res = await api<any>(`/reports/ticket-volume?${params}`);
      const rows = Array.isArray(res) ? res : [];
      setTicketData(rows.map((r: any) => ({ date: String(r.day).split('T')[0], count: Number(r.count) || 0 })));
      const created = rows.reduce((s: number, r: any) => s + (Number(r.count) || 0), 0);
      setTicketSummary({ created, resolved: 0, open: 0 });
    } catch {
      setTicketData([]);
      setTicketSummary({ created: 0, resolved: 0, open: 0 });
    } finally {
      setTicketLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchSlaReport = useCallback(async () => {
    setSlaLoading(true);
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo });
      const res = await api<any>(`/reports/sla-compliance?${params}`);
      setSlaData({ met: res.met ?? 0, breached: res.breached ?? 0 });
    } catch {
      setSlaData({ met: 0, breached: 0 });
    } finally {
      setSlaLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchUtilizationReport = useCallback(async () => {
    setUtilizationLoading(true);
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo });
      const res = await api<any>(`/reports/tech-utilization?${params}`);
      const rows = Array.isArray(res) ? res : [];
      setUtilizationData(rows.map((r: any) => ({ techId: r.userId || '', techName: r.displayName || 'Unknown', hours: r.totalHours || 0 })));
    } catch {
      setUtilizationData([]);
    } finally {
      setUtilizationLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchRevenueReport = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const res = await api<any>(`/reports/revenue-by-customer`);
      const rows = Array.isArray(res) ? res : [];
      setRevenueData(rows.slice(0, 10).map((r: any) => ({ customerId: r.customerId || '', customerName: r.customerName || 'Unknown', mrr: r.totalRevenueCents || 0 })));
    } catch {
      setRevenueData([]);
    } finally {
      setRevenueLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchTimeReport = useCallback(async () => {
    setTimeLoading(true);
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo });
      const res = await api<any>(`/reports/time-summary?${params}`);
      const rows = Array.isArray(res) ? res : [];
      // Group by tech
      const techMap = new Map<string, { techName: string; entries: number; hours: number }>();
      for (const r of rows) {
        const name = r.displayName || 'Unknown';
        const existing = techMap.get(name) || { techName: name, entries: 0, hours: 0 };
        existing.entries += 1;
        existing.hours += (r.totalMinutes || 0) / 60;
        techMap.set(name, existing);
      }
      setTimeData(Array.from(techMap.values()).map(t => ({ ...t, hours: Math.round(t.hours * 10) / 10 })));
    } catch {
      setTimeData([]);
    } finally {
      setTimeLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchInvoiceReport = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const res = await api<any>('/reports/invoice-aging');
      const summary = res.summary || {};
      setAgingData([
        { bucket: 'Current', amount: summary.currentCents || 0 },
        { bucket: '1-30 days', amount: summary['1_30_cents'] || 0 },
        { bucket: '31-60 days', amount: summary['31_60_cents'] || 0 },
        { bucket: '61-90 days', amount: summary['61_90_cents'] || 0 },
        { bucket: '90+ days', amount: summary['90_plus_cents'] || 0 },
      ]);
    } catch {
      setAgingData([]);
    } finally {
      setInvoiceLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch on tab change / date change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (activeTab === 'tickets') fetchTicketReport();
    else if (activeTab === 'sla') fetchSlaReport();
    else if (activeTab === 'utilization') fetchUtilizationReport();
    else if (activeTab === 'revenue') fetchRevenueReport();
    else if (activeTab === 'time') fetchTimeReport();
    else if (activeTab === 'invoices') fetchInvoiceReport();
  }, [activeTab, dateFrom, dateTo, fetchTicketReport, fetchSlaReport, fetchUtilizationReport, fetchRevenueReport, fetchTimeReport, fetchInvoiceReport]);

  // ---------------------------------------------------------------------------
  // Date presets
  // ---------------------------------------------------------------------------

  function setPreset(preset: string) {
    switch (preset) {
      case 'week':
        setDateFrom(startOfWeek());
        setDateTo(todayStr());
        break;
      case 'month':
        setDateFrom(startOfMonth());
        setDateTo(todayStr());
        break;
      case 'last_month': {
        const [s, e] = lastMonthRange();
        setDateFrom(s);
        setDateTo(e);
        break;
      }
      case 'quarter':
        setDateFrom(startOfQuarter());
        setDateTo(todayStr());
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const slaTotal = slaData.met + slaData.breached;
  const slaCompliance = slaTotal > 0 ? Math.round((slaData.met / slaTotal) * 100) : 0;
  const slaPieData = [
    { name: 'Met', value: slaData.met },
    { name: 'Breached', value: slaData.breached },
  ];

  const totalUtilHours = utilizationData.reduce((s, t) => s + t.hours, 0);
  const avgUtilHours = utilizationData.length > 0 ? (totalUtilHours / utilizationData.length).toFixed(1) : '0';

  const totalMrr = revenueData.reduce((s, c) => s + c.mrr, 0);

  const totalOutstanding = agingData.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-4">
      {/* Date range bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground mr-2">Date Range:</span>
            <Button variant="outline" size="sm" onClick={() => setPreset('week')}>This Week</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('month')}>This Month</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('last_month')}>Last Month</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('quarter')}>This Quarter</Button>
            <div className="flex items-center gap-1.5 ml-2 rounded-lg border border-input bg-background px-2 py-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent text-sm outline-none border-none"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-transparent text-sm outline-none border-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* Tickets Tab                                                       */}
        {/* ================================================================ */}
        <TabsContent value="tickets">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Created</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{ticketSummary.created}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Resolved</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{ticketSummary.resolved}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Open</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-blue-600">{ticketSummary.open}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tickets Created Per Day</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('tickets-report.csv', ['Date', 'Count'], ticketData.map(d => [d.date, String(d.count)]));
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {ticketLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : ticketData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ticketData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* SLA Tab                                                           */}
        {/* ================================================================ */}
        <TabsContent value="sla">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Compliance %</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{slaCompliance}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SLA Met</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{slaData.met}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SLA Breached</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">{slaData.breached}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>SLA Compliance</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('sla-report.csv', ['Status', 'Count'], [['Met', String(slaData.met)], ['Breached', String(slaData.breached)]]);
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {slaLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : slaTotal === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No SLA data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={slaPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      <Cell fill={COLORS[1]} />
                      <Cell fill={COLORS[3]} />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Utilization Tab                                                   */}
        {/* ================================================================ */}
        <TabsContent value="utilization">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Hours</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{totalUtilHours.toFixed(1)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Per Tech</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{avgUtilHours}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Hours Per Technician</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('utilization-report.csv', ['Technician', 'Hours'], utilizationData.map(d => [d.techName, d.hours.toFixed(1)]));
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {utilizationLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : utilizationData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No utilization data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, utilizationData.length * 40)}>
                  <BarChart data={utilizationData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="techName" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="hours" fill={COLORS[4]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Revenue Tab                                                       */}
        {/* ================================================================ */}
        <TabsContent value="revenue">
          <div className="grid grid-cols-1 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total MRR</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">${(totalMrr / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Revenue by Customer (Top 10)</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('revenue-report.csv', ['Customer', 'MRR (cents)'], revenueData.map(d => [d.customerName, String(d.mrr)]));
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : revenueData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No revenue data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="customerName" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
                    <Tooltip formatter={(v: any) => `$${(Number(v) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    <Bar dataKey="mrr" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Time Tab                                                          */}
        {/* ================================================================ */}
        <TabsContent value="time">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Time Entries by Technician</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('time-report.csv', ['Technician', 'Entries', 'Hours'], timeData.map(d => [d.techName, String(d.entries), d.hours.toFixed(1)]));
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {timeLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : timeData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">No time data for selected period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Technician</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Entries</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeData.map((t, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-3">{t.techName}</td>
                          <td className="py-2 px-3 text-right">{t.entries}</td>
                          <td className="py-2 px-3 text-right font-medium">{t.hours.toFixed(1)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="py-2 px-3">Total</td>
                        <td className="py-2 px-3 text-right">{timeData.reduce((s, t) => s + t.entries, 0)}</td>
                        <td className="py-2 px-3 text-right">{timeData.reduce((s, t) => s + t.hours, 0).toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Invoices Tab                                                      */}
        {/* ================================================================ */}
        <TabsContent value="invoices">
          <div className="grid grid-cols-1 gap-4 mb-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">${(totalOutstanding / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoice Aging</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCsv('invoice-aging.csv', ['Bucket', 'Amount (cents)'], agingData.map(d => [d.bucket, String(d.amount)]));
              }}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            </CardHeader>
            <CardContent>
              {invoiceLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : agingData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">No invoice aging data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
                    <Tooltip formatter={(v: any) => `$${(Number(v) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    <Bar dataKey="amount" fill={COLORS[2]} radius={[4, 4, 0, 0]}>
                      {agingData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
