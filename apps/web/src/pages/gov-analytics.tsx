import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import {
  DollarSign, TrendingUp, Trophy, Target, LayoutList,
  PieChart as PieChartIcon, BarChart3, FileBarChart, ShieldCheck,
  Building2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsData {
  winLoss?: { awarded: number; lost: number };
  revenueByMonth?: Array<{ month: string; revenueCents: number }>;
  monthlyRevenue?: Array<{ month: string; revenueCents: number }>;
  avgBidValueCents: number;
  byAgencyType?: Array<{ agencyType: string; count: number; awardedCount: number; totalValueCents: number }>;
  bySetAside?: Array<{ setAsideType: string; count: number; awardedCount: number; winRate: number }>;
  totalPipelineValueCents: number;
  totalAwardedValueCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#22c55e', '#ef4444'];
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

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
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message }: { icon: typeof PieChartIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground gap-3">
      <Icon className="h-10 w-10 opacity-30" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom donut center label
// ---------------------------------------------------------------------------

function DonutCenterLabel({ viewBox, value }: { viewBox?: { cx: number; cy: number }; value: string }) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.4em" className="fill-foreground text-2xl font-bold">
        {value}
      </tspan>
      <tspan x={cx} dy="1.4em" className="fill-muted-foreground text-xs">
        win rate
      </tspan>
    </text>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip for agency chart
// ---------------------------------------------------------------------------

function AgencyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload: { name: string; total: number; awarded: number; valueDollars: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="text-muted-foreground">Total: {d.total}</p>
      <p className="text-muted-foreground">Awarded: {d.awarded}</p>
      <p className="text-muted-foreground">Value: {formatDollarsLong(d.valueDollars * 100)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip for set-aside chart
// ---------------------------------------------------------------------------

function SetAsideTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; count: number; awardedCount: number; winRate: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="text-muted-foreground">Count: {d.count}</p>
      <p className="text-muted-foreground">Awarded: {d.awardedCount}</p>
      <p className="text-muted-foreground">Win Rate: {d.winRate}%</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set-aside bar label (win rate)
// ---------------------------------------------------------------------------

function SetAsideBarLabel(props: { x?: number; y?: number; width?: number; height?: number; value?: number; payload?: { winRate: number } }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      textAnchor="start"
      dominantBaseline="central"
      className="fill-muted-foreground text-[11px]"
    >
      {payload.winRate}% win
    </text>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-4 mb-3" />
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
      <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
    </div>
  );
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

  if (loading) return <AnalyticsSkeleton />;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load analytics data
      </div>
    );
  }

  // ── Derived data ────────────────────────────────────────────────────

  const awarded = data.winLoss?.awarded ?? 0;
  const lost = data.winLoss?.lost ?? 0;
  const totalOpportunities = awarded + lost;
  const winRate = totalOpportunities > 0 ? Math.round((awarded / totalOpportunities) * 100) : 0;
  const hasPieData = totalOpportunities > 0;

  const pieData = [
    { name: 'Awarded', value: awarded },
    { name: 'Lost', value: lost },
  ];

  const revenueChartData = (data.monthlyRevenue ?? data.revenueByMonth ?? []).map(r => ({
    month: r.month,
    revenue: r.revenueCents / 100,
  }));

  const agencyChartData = (data.byAgencyType ?? []).map(a => ({
    name: a.agencyType.charAt(0).toUpperCase() + a.agencyType.slice(1),
    total: a.count,
    awarded: a.awardedCount,
    valueDollars: a.totalValueCents / 100,
  }));

  const setAsideChartData = (data.bySetAside ?? []).map(s => ({
    name: s.setAsideType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    count: s.count,
    awardedCount: s.awardedCount,
    winRate: s.winRate,
  }));

  // ── KPI cards config ────────────────────────────────────────────────

  const kpis: Array<{
    title: string;
    value: string;
    icon: typeof DollarSign;
    iconColor: string;
    valueColor: string;
  }> = [
    {
      title: 'Avg Bid Value',
      value: formatDollars(data.avgBidValueCents),
      icon: DollarSign,
      iconColor: 'text-blue-400',
      valueColor: '',
    },
    {
      title: 'Total Pipeline Value',
      value: formatDollars(data.totalPipelineValueCents),
      icon: TrendingUp,
      iconColor: 'text-blue-400',
      valueColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Total Awarded Value',
      value: formatDollars(data.totalAwardedValueCents),
      icon: Trophy,
      iconColor: 'text-emerald-400',
      valueColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Win Rate',
      value: `${winRate}%`,
      icon: Target,
      iconColor: 'text-amber-400',
      valueColor: winRate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Total Opportunities',
      value: String(totalOpportunities),
      icon: LayoutList,
      iconColor: 'text-violet-400',
      valueColor: '',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.title} className="bg-gradient-to-br from-muted/50 to-background border">
            <CardContent className="p-5">
              <kpi.icon className={`h-5 w-5 ${kpi.iconColor} mb-3`} />
              <div className={`text-3xl font-bold tracking-tight ${kpi.valueColor}`}>
                {kpi.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Charts Row: Win/Loss Donut + Revenue Area ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win/Loss Donut */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Win / Loss Ratio</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {hasPieData ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx]} />
                    ))}
                    <DonutCenterLabel value={`${winRate}%`} />
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number, name: string) => [`${value} opportunities`, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={10}
                    formatter={(value: string) => {
                      const count = value === 'Awarded' ? awarded : lost;
                      return <span className="text-sm text-muted-foreground">{value} ({count})</span>;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={PieChartIcon} message="No win/loss data available yet" />
            )}
          </CardContent>
        </Card>

        {/* Revenue Area Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Revenue from Awarded Contracts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Month', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(v: number) => formatDollars(v * 100)}
                    label={{ value: 'Revenue', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatDollarsLong(Number(value) * 100), 'Revenue']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={FileBarChart} message="No revenue data available yet" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Performance by Agency Type ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Performance by Agency Type</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total vs awarded opportunities with contract value</p>
        </CardHeader>
        <CardContent>
          {agencyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, agencyChartData.length * 56)}>
              <BarChart data={agencyChartData} layout="vertical" margin={{ top: 8, right: 32, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Opportunities', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<AgencyTooltip />} />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" fill={BAR_COLORS[0]} name="Total" radius={[0, 4, 4, 0]} barSize={18} />
                <Bar dataKey="awarded" fill={BAR_COLORS[1]} name="Awarded" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Building2} message="No agency performance data available yet" />
          )}
        </CardContent>
      </Card>

      {/* ── Performance by Set-Aside Type ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Performance by Set-Aside Type</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Opportunity count and win rate by set-aside classification</p>
        </CardHeader>
        <CardContent>
          {setAsideChartData.length > 0 ? (
            <div className="space-y-6">
              {/* Horizontal bar chart */}
              <ResponsiveContainer width="100%" height={Math.max(280, setAsideChartData.length * 48)}>
                <BarChart
                  data={setAsideChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 80, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Count', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip content={<SetAsideTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Count"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    label={<SetAsideBarLabel />}
                  >
                    {setAsideChartData.map((_, idx) => (
                      <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Detail table */}
              <div className="overflow-x-auto border rounded-lg">
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
                    {(data.bySetAside ?? []).map(row => (
                      <tr key={row.setAsideType} className="border-b last:border-b-0">
                        <td className="px-4 py-3 capitalize">{row.setAsideType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.awardedCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={row.winRate >= 50 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                            {row.winRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} message="No set-aside data available yet" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
