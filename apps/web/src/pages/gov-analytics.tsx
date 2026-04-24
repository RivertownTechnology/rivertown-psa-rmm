import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsData {
  winLoss: { awarded: number; lost: number };
  revenueByMonth: Array<{ month: string; revenueCents: number }>;
  avgBidValueCents: number;
  byAgencyType: Array<{ agencyType: string; count: number; awardedCount: number; totalValueCents: number }>;
  bySetAside: Array<{ setAsideType: string; count: number; awardedCount: number; winRate: number }>;
  totalPipelineValueCents: number;
  totalAwardedValueCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#22c55e', '#ef4444'];
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

function formatDollarsLong(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GovAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const result = await api<AnalyticsData>('/gov/analytics');
      setData(result);
    } catch {
      // leave null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load analytics data
      </div>
    );
  }

  const pieData = [
    { name: 'Awarded', value: data.winLoss.awarded },
    { name: 'Lost', value: data.winLoss.lost },
  ];
  const hasPieData = data.winLoss.awarded > 0 || data.winLoss.lost > 0;
  const winRate = hasPieData ? Math.round((data.winLoss.awarded / (data.winLoss.awarded + data.winLoss.lost)) * 100) : 0;

  const revenueChartData = data.revenueByMonth.map(r => ({
    month: r.month,
    revenue: r.revenueCents / 100,
  }));

  const agencyChartData = data.byAgencyType.map(a => ({
    name: a.agencyType.charAt(0).toUpperCase() + a.agencyType.slice(1),
    total: a.count,
    awarded: a.awardedCount,
    value: a.totalValueCents / 100,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Bid Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatDollars(data.avgBidValueCents)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pipeline Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{formatDollars(data.totalPipelineValueCents)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Awarded Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{formatDollars(data.totalAwardedValueCents)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win/Loss Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win/Loss Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            {hasPieData ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-sm">Awarded: {data.winLoss.awarded}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm">Lost: {data.winLoss.lost}</span>
                  </div>
                  <div className="text-3xl font-bold mt-2">{winRate}%</div>
                  <div className="text-xs text-muted-foreground">win rate</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No win/loss data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue from Awarded Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                    tickFormatter={(v: number) => formatDollars(v * 100)}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatDollarsLong(Number(value) * 100), 'Revenue']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No revenue data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance by Agency Type (horizontal bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Performance by Agency Type</CardTitle>
        </CardHeader>
        <CardContent>
          {agencyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, agencyChartData.length * 50)}>
              <BarChart data={agencyChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" fill="#3b82f6" name="Total" radius={[0, 4, 4, 0]} />
                <Bar dataKey="awarded" fill="#22c55e" name="Awarded" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              No agency data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance by Set-Aside (table) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Performance by Set-Aside Type</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.bySetAside.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Set-Aside Type</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-right px-4 py-3 font-medium">Awarded</th>
                    <th className="text-right px-4 py-3 font-medium">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySetAside.map(row => (
                    <tr key={row.setAsideType} className="border-b">
                      <td className="px-4 py-3 capitalize">{row.setAsideType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right">{row.awardedCount}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={row.winRate >= 50 ? 'text-green-600 font-medium' : ''}>
                          {row.winRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
              No set-aside data yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
