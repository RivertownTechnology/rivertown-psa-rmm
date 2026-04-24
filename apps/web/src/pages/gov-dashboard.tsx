import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Landmark, Clock, TrendingUp, Activity,
  AlertTriangle, Trophy, XCircle,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStatus {
  status: string;
  count: number;
  totalEstimatedValue: number;
}

interface UpcomingDeadline {
  id: string;
  title: string;
  agency: string;
  submissionDeadline: string;
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  opportunityTitle: string;
  createdAt: string;
}

interface DashboardData {
  statusCounts: Array<{ status: string; count: number; totalValue: number }>;
  upcomingDeadlines: UpcomingDeadline[];
  winRate: number;
  pipelineValue: number;
  awardedValue: number;
  recentActivities: Array<{ id: string; activityType: string; description: string; createdAt: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_ORDER = ['discovered', 'qualified', 'in_review', 'in_progress', 'submitted', 'awarded', 'lost'];

const STATUS_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  qualified: 'Qualified',
  in_review: 'In Review',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  awarded: 'Awarded',
  lost: 'Lost',
};

const STATUS_COLORS: Record<string, string> = {
  discovered: 'bg-gray-100 text-gray-700',
  qualified: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-purple-100 text-purple-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  awarded: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

const STATUS_ICONS: Record<string, typeof Landmark> = {
  discovered: Landmark,
  qualified: TrendingUp,
  in_review: Clock,
  in_progress: Activity,
  submitted: AlertTriangle,
  awarded: Trophy,
  lost: XCircle,
};

const PIE_COLORS = ['#22c55e', '#ef4444'];

function formatDollars(cents: number): string {
  if (cents >= 100_000_00) {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

function formatLargeDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
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
  return `${diffDays}d ago`;
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-9 w-20" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load dashboard data
      </div>
    );
  }

  // Build pipeline map for easy lookup
  const pipelineMap = new Map((data.statusCounts ?? []).map(p => [p.status, p]));

  const awardedCount = pipelineMap.get('awarded')?.count ?? 0;
  const lostCount = pipelineMap.get('lost')?.count ?? 0;
  const pieData = [
    { name: 'Awarded', value: awardedCount },
    { name: 'Lost', value: lostCount },
  ];
  const hasWinData = awardedCount > 0 || lostCount > 0;

  return (
    <div className="space-y-6">
      {/* Pipeline Value Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Pipeline Value</p>
              <p className="text-4xl font-bold mt-1">{formatLargeDollars(data.pipelineValue)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Total estimated value of non-awarded, non-lost opportunities
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary opacity-60" />
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Summary Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Pipeline Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {STATUS_ORDER.map(status => {
            const item = pipelineMap.get(status);
            const count = item?.count ?? 0;
            const value = item?.totalValue ?? 0;
            const Icon = STATUS_ICONS[status] ?? Landmark;
            return (
              <Card key={status} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </Badge>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatLargeDollars(value)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Win Rate + Upcoming Deadlines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {hasWinData ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={180}>
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
                    <span className="text-sm">Awarded: {awardedCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm">Lost: {lostCount}</span>
                  </div>
                  <div className="text-3xl font-bold mt-2">
                    {data.winRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">win rate</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">
                No win/loss data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Deadlines (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingDeadlines.length > 0 ? (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {data.upcomingDeadlines.map(d => {
                  const daysRemaining = d.submissionDeadline
                    ? Math.ceil((new Date(d.submissionDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : 0;
                  return (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{d.title}</div>
                        <div className="text-xs text-muted-foreground">{d.agency}</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className={`text-sm font-semibold ${
                          daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 14 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {daysRemaining}d
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {d.submissionDeadline ? new Date(d.submissionDeadline).toLocaleDateString() : 'No deadline'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">
                No upcoming deadlines
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(data.recentActivities ?? []).length > 0 ? (
            <div className="space-y-3">
              {(data.recentActivities ?? []).map(a => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="mt-1">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{a.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {timeAgo(a.createdAt)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {a.activityType}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No recent activity
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
