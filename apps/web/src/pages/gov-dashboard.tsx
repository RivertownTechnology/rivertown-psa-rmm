import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import {
  Landmark, Target, Trophy, Clock, TrendingUp, Activity,
  DollarSign, ArrowRight, Plus, Upload, BarChart3, AlertTriangle,
} from 'lucide-react';
import { CHART_COLORS } from '@/lib/badge-colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  statusCounts: Array<{ status: string; count: number; totalValue: number }>;
  upcomingDeadlines: Array<{ id: string; title: string; agency: string; submissionDeadline: string }>;
  winRate: number;
  pipelineValue: number;
  awardedValue: number;
  recentActivities: Array<{ id: string; activityType: string; description: string; createdAt: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUNNEL_STAGES = ['discovered', 'qualified', 'in_review', 'in_progress', 'submitted', 'awarded', 'lost'];

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  qualified: 'Qualified',
  in_review: 'In Review',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  awarded: 'Awarded',
  lost: 'Lost',
};

const STAGE_COLORS: Record<string, string> = {
  discovered: '#93c5fd',  // blue-300
  qualified: '#60a5fa',   // blue-400
  in_review: '#3b82f6',   // blue-500
  in_progress: '#2563eb', // blue-600
  submitted: '#1d4ed8',   // blue-700
  awarded: '#22c55e',     // green-500
  lost: '#ef4444',        // red-500
};

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  status_change: 'bg-blue-500',
  note_added: 'bg-amber-500',
  document_uploaded: 'bg-violet-500',
  bid_submitted: 'bg-emerald-500',
  deadline_approaching: 'bg-red-500',
  created: 'bg-cyan-500',
};

const ACTIVITY_BADGE_VARIANTS: Record<string, string> = {
  status_change: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  note_added: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  document_uploaded: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  bid_submitted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  deadline_approaching: 'bg-red-500/10 text-red-600 dark:text-red-400',
  created: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
};

function formatCompactDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}m`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return `$${Math.round(dollars)}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString();
}

function pushPath(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function formatActivityType(type: string): string {
  return type
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg bg-background/80 p-5">
              <Skeleton className="h-4 w-4 mb-3" />
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      {/* Pipeline skeleton */}
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
      {/* Bottom grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip for Pipeline Chart
// ---------------------------------------------------------------------------

function PipelineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { stage: string; count: number; value: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{d.stage}</p>
      <p className="text-muted-foreground">{d.count} opportunities</p>
      <p className="text-muted-foreground">{formatCompactDollars(d.value)} value</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GovDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api<DashboardData>('/gov/dashboard');
      setData(result);
    } catch {
      // leave null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load dashboard data
      </div>
    );
  }

  // Build lookup
  const statusMap = new Map((data.statusCounts ?? []).map(s => [s.status, s]));

  // KPI computations
  const activeBids = FUNNEL_STAGES
    .filter(s => s !== 'awarded' && s !== 'lost')
    .reduce((sum, s) => sum + (statusMap.get(s)?.count ?? 0), 0);

  // Funnel chart data
  const funnelData = FUNNEL_STAGES.map(s => ({
    stage: STAGE_LABELS[s],
    stageKey: s,
    count: statusMap.get(s)?.count ?? 0,
    value: statusMap.get(s)?.totalValue ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* ── Hero Section ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-8 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-emerald-600/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-1">
            <Landmark className="h-7 w-7 text-blue-400" />
            <h1 className="text-2xl font-bold tracking-tight">Government Contracts</h1>
          </div>
          <p className="text-slate-400 text-sm mb-8 ml-10">
            Pipeline overview, deadlines, and activity at a glance
          </p>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pipeline Value */}
            <div className="rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 p-5 hover:bg-white/[0.08] transition-colors">
              <DollarSign className="h-5 w-5 text-blue-400 mb-3" />
              <div className="text-3xl font-bold tracking-tight">{formatCompactDollars(data.pipelineValue)}</div>
              <div className="text-xs text-slate-400 mt-1">Pipeline Value</div>
            </div>

            {/* Win Rate */}
            <div className="rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 p-5 hover:bg-white/[0.08] transition-colors">
              <Target className="h-5 w-5 text-emerald-400 mb-3" />
              <div className="text-3xl font-bold tracking-tight">{data.winRate}%</div>
              <div className="text-xs text-slate-400 mt-1">Win Rate</div>
            </div>

            {/* Active Bids */}
            <div className="rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 p-5 hover:bg-white/[0.08] transition-colors">
              <TrendingUp className="h-5 w-5 text-amber-400 mb-3" />
              <div className="text-3xl font-bold tracking-tight">{activeBids}</div>
              <div className="text-xs text-slate-400 mt-1">Active Bids</div>
            </div>

            {/* Awarded Value */}
            <div className="rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 p-5 hover:bg-white/[0.08] transition-colors">
              <Trophy className="h-5 w-5 text-yellow-400 mb-3" />
              <div className="text-3xl font-bold tracking-tight">{formatCompactDollars(data.awardedValue)}</div>
              <div className="text-xs text-slate-400 mt-1">Awarded Value</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pipeline Funnel ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Pipeline Funnel</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Opportunity count by stage with total value</p>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 120, left: 0, bottom: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={100}
                tick={{ fontSize: 13, fill: 'currentColor' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                barSize={28}
                label={({ x, y, width, height, value, index }: { x: number; y: number; width: number; height: number; value: number; index: number }) => {
                  const item = funnelData[index];
                  return (
                    <text
                      x={x + width + 6}
                      y={y + height / 2}
                      textAnchor="start"
                      dominantBaseline="middle"
                      className="fill-current text-xs"
                    >
                      {value}  ({formatCompactDollars(item?.value ?? 0)})
                    </text>
                  );
                }}
              >
                {funnelData.map((d) => (
                  <Cell key={d.stageKey} fill={STAGE_COLORS[d.stageKey] ?? CHART_COLORS.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
              Active Stages
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
              Awarded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              Lost
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Bottom Grid: Deadlines | Activity | Quick Actions ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Deadlines */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.upcomingDeadlines.length > 0 ? (
              <div className="space-y-1">
                {data.upcomingDeadlines.slice(0, 8).map(d => {
                  const daysRemaining = d.submissionDeadline
                    ? Math.ceil((new Date(d.submissionDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const urgencyClass =
                    daysRemaining <= 7
                      ? 'text-red-600 dark:text-red-400 bg-red-500/10'
                      : daysRemaining <= 14
                        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                        : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';

                  return (
                    <button
                      key={d.id}
                      onClick={() => pushPath(`/gov/opportunities/${d.id}`)}
                      className="w-full flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors text-left cursor-pointer group"
                    >
                      <div className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${urgencyClass}`}>
                        {daysRemaining}d
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {d.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{d.agency}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-sm text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-40" />
                No upcoming deadlines
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {(data.recentActivities ?? []).length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />

                <div className="space-y-0">
                  {(data.recentActivities ?? []).slice(0, 10).map((a, idx) => {
                    const dotColor = ACTIVITY_DOT_COLORS[a.activityType] ?? 'bg-gray-400';
                    const badgeClass = ACTIVITY_BADGE_VARIANTS[a.activityType] ?? 'bg-gray-500/10 text-gray-600 dark:text-gray-400';

                    return (
                      <div key={a.id} className="flex items-start gap-3 py-2.5 pl-0 relative">
                        {/* Timeline dot */}
                        <div className={`shrink-0 h-[15px] w-[15px] rounded-full ${dotColor} ring-2 ring-background relative z-10 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm leading-snug">{a.description}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`text-[10px] px-1.5 py-0 border-0 font-medium ${badgeClass}`}>
                              {formatActivityType(a.activityType)}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-sm text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-40" />
                No recent activity
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-sm"
                onClick={() => pushPath('/gov/opportunities/new')}
              >
                <Plus className="h-4 w-4 mr-3 text-blue-500" />
                Start New Opportunity
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-12 text-sm"
                onClick={() => pushPath('/gov/opportunities/import')}
              >
                <Upload className="h-4 w-4 mr-3 text-violet-500" />
                Import RFP
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-12 text-sm"
                onClick={() => pushPath('/gov/opportunities')}
              >
                <BarChart3 className="h-4 w-4 mr-3 text-emerald-500" />
                View Pipeline
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-12 text-sm"
                onClick={() => pushPath('/gov/analytics')}
              >
                <TrendingUp className="h-4 w-4 mr-3 text-amber-500" />
                View Analytics
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>
            </div>

            {/* Summary stat at bottom */}
            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total opportunities</span>
                <span className="font-semibold">
                  {FUNNEL_STAGES.reduce((sum, s) => sum + (statusMap.get(s)?.count ?? 0), 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">Awarded this period</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {statusMap.get('awarded')?.count ?? 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
