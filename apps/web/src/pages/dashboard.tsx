import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCentsShort } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Ticket, Building2, Clock, AlertTriangle, DollarSign, TrendingUp,
  PieChart as PieChartIcon, Receipt, ShieldAlert, Eye, EyeOff, Settings2,
  CheckCircle2, Circle, ArrowRight, X,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip,
} from 'recharts';

interface DashboardStats {
  customers: { total: number };
  tickets: { open: number; critical: number; new: number; slaBreached: number };
  invoices: { open: number; overdue: number; outstandingCents: number; paidThisMonthCents: number };
  contracts: {
    monthlyRevenueCents: number; productCostCents: number; laborCostCents: number;
    totalCostCents: number; trueProfitCents: number; trueMarginPercent: number;
  };
  labor: { totalHours: number; unbilledHours: number };
}

interface Widget {
  id: string;
  title: string;
  getValue: (s: DashboardStats) => string | number;
  icon: typeof Building2;
  color: string;
  category: 'general' | 'billing' | 'financial';
  link?: string;
}

function pushPath(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const ALL_WIDGETS: Widget[] = [
  { id: 'customers', title: 'Customers', getValue: s => s.customers.total, icon: Building2, color: 'text-blue-600', category: 'general', link: '/customers' },
  { id: 'open_tickets', title: 'Open Tickets', getValue: s => s.tickets.open, icon: Ticket, color: 'text-green-600', category: 'general', link: '/tickets' },
  { id: 'new_tickets', title: 'New Tickets', getValue: s => s.tickets.new, icon: Ticket, color: 'text-blue-500', category: 'general', link: '/tickets' },
  { id: 'critical_tickets', title: 'Critical Tickets', getValue: s => s.tickets.critical, icon: AlertTriangle, color: 'text-red-600', category: 'general', link: '/tickets' },
  { id: 'sla_breached', title: 'SLA Breached', getValue: s => s.tickets.slaBreached, icon: ShieldAlert, color: 'text-red-500', category: 'general', link: '/tickets' },
  { id: 'unbilled_hours', title: 'Unbilled Hours', getValue: s => s.labor.unbilledHours, icon: Clock, color: 'text-orange-600', category: 'general', link: '/billing/time-entries' },
  { id: 'total_labor_hours', title: 'Total Labor Hours', getValue: s => s.labor.totalHours, icon: Clock, color: 'text-purple-600', category: 'general', link: '/billing/time-entries' },
  { id: 'open_invoices', title: 'Open Invoices', getValue: s => s.invoices.open, icon: Receipt, color: 'text-blue-600', category: 'billing', link: '/billing/invoices' },
  { id: 'overdue_invoices', title: 'Overdue Invoices', getValue: s => s.invoices.overdue, icon: Receipt, color: 'text-red-600', category: 'billing', link: '/billing/invoices' },
  { id: 'outstanding', title: 'Outstanding', getValue: s => formatCentsShort(s.invoices.outstandingCents), icon: DollarSign, color: 'text-orange-600', category: 'billing', link: '/billing/invoices' },
  { id: 'paid_this_month', title: 'Paid This Month', getValue: s => formatCentsShort(s.invoices.paidThisMonthCents), icon: DollarSign, color: 'text-green-600', category: 'billing', link: '/billing/invoices' },
  { id: 'monthly_revenue', title: 'Monthly Revenue', getValue: s => formatCentsShort(s.contracts.monthlyRevenueCents), icon: DollarSign, color: 'text-green-600', category: 'financial', link: '/billing/contracts' },
  { id: 'product_cost', title: 'Product Cost', getValue: s => formatCentsShort(s.contracts.productCostCents), icon: DollarSign, color: 'text-red-500', category: 'financial', link: '/billing/contracts' },
  { id: 'labor_cost', title: 'Labor Cost', getValue: s => formatCentsShort(s.contracts.laborCostCents), icon: Clock, color: 'text-orange-500', category: 'financial', link: '/billing/contracts' },
  { id: 'true_profit', title: 'True Profit', getValue: s => formatCentsShort(s.contracts.trueProfitCents), icon: TrendingUp, color: 'text-green-600', category: 'financial', link: '/billing/contracts' },
  { id: 'true_margin', title: 'True Margin', getValue: s => `${s.contracts.trueMarginPercent}%`, icon: PieChartIcon, color: 'text-purple-600', category: 'financial', link: '/billing/contracts' },
];

const DEFAULT_VISIBLE = ['customers', 'open_tickets', 'critical_tickets', 'unbilled_hours', 'open_invoices', 'overdue_invoices', 'monthly_revenue', 'true_profit'];

// Onboarding checklist
interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  check: (stats: DashboardStats) => boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'customer', label: 'Add your first customer', description: 'Create a customer to start managing their IT', href: '/customers', check: s => s.customers.total > 0 },
  { id: 'contract', label: 'Create a contract', description: 'Set up a managed services or block time contract', href: '/billing/contracts', check: () => false },
  { id: 'catalog', label: 'Set up your service catalog', description: 'Define your products and services with pricing', href: '/catalog', check: () => false },
  { id: 'ticket', label: 'Create your first ticket', description: 'Log a service request or incident', href: '/tickets', check: s => s.tickets.open > 0 || s.tickets.new > 0 },
];

function OnboardingBanner({ stats }: { stats: DashboardStats }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('onboarding-dismissed') === 'true');

  if (dismissed) return null;

  const completed = ONBOARDING_STEPS.filter(s => s.check(stats));
  const total = ONBOARDING_STEPS.length;
  const progress = (completed.length / total) * 100;

  if (completed.length === total) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Welcome to Rivertown PSA</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Complete these steps to get your MSP set up</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => { setDismissed(true); localStorage.setItem('onboarding-dismissed', 'true'); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 mb-4">
          {ONBOARDING_STEPS.map(step => {
            const done = step.check(stats);
            return (
              <button
                key={step.id}
                onClick={() => !done && pushPath(step.href)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  done ? 'opacity-60' : 'hover:bg-primary/10 cursor-pointer'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${done ? 'line-through text-muted-foreground' : ''}`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                </div>
                {!done && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-muted rounded-full h-2">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{completed.length}/{total} complete</span>
        </div>
      </CardContent>
    </Card>
  );
}

const SLA_COLORS = ['#22c55e', '#ef4444'];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const stored = localStorage.getItem('dashboard-widgets');
    return stored ? JSON.parse(stored) : DEFAULT_VISIBLE;
  });
  const [showConfig, setShowConfig] = useState(false);

  // Chart data
  const [ticketVolume, setTicketVolume] = useState<Array<{ day: string; count: number }>>([]);
  const [slaCompliance, setSlaCompliance] = useState<{ met: number; breached: number; total: number } | null>(null);

  const fetchStats = useCallback(() => {
    api<DashboardStats>('/dashboard/stats').then(setStats).catch(() => {});
  }, []);

  const fetchCharts = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    api<Array<{ day: string; count: number }>>(`/reports/ticket-volume?startDate=${startStr}&endDate=${endStr}`)
      .then(data => {
        if (!Array.isArray(data)) { setTicketVolume([]); return; }
        // Fill in missing days
        const dayMap = new Map(data.map(d => [new Date(d.day).toISOString().split('T')[0], d.count]));
        const filled: Array<{ day: string; count: number }> = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          filled.push({ day: key, count: dayMap.get(key) ?? 0 });
        }
        setTicketVolume(filled);
      })
      .catch(() => setTicketVolume([]));

    const slaStart = new Date();
    slaStart.setDate(slaStart.getDate() - 30);
    api<{ met: number; breached: number; total: number }>(`/reports/sla-compliance?startDate=${slaStart.toISOString().split('T')[0]}&endDate=${endStr}`)
      .then(setSlaCompliance)
      .catch(() => setSlaCompliance(null));
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCharts();
    // Poll every 30 seconds, not every 1 second
    const interval = setInterval(fetchStats, 30000);
    function onVisible() { if (document.visibilityState === 'visible') { fetchStats(); fetchCharts(); } }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('popstate', fetchStats);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('popstate', fetchStats);
    };
  }, [fetchStats, fetchCharts]);

  function toggleWidget(id: string) {
    setVisibleWidgets(prev => {
      const next = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      localStorage.setItem('dashboard-widgets', JSON.stringify(next));
      return next;
    });
  }

  const activeWidgets = ALL_WIDGETS.filter(w => visibleWidgets.includes(w.id));
  const categories = [
    { key: 'general', label: 'General' },
    { key: 'billing', label: 'Billing' },
    { key: 'financial', label: 'Financial (Company P&L)' },
  ];

  return (
    <div className="space-y-6">
      {/* Onboarding */}
      {stats && <OnboardingBanner stats={stats} />}

      {/* Header with config toggle */}
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
          <Settings2 className="h-4 w-4 mr-1" />
          {showConfig ? 'Done' : 'Configure Widgets'}
        </Button>
      </div>

      {/* Widget configuration panel */}
      {showConfig && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-3">Click widgets to show or hide them on your dashboard.</p>
            {categories.map(cat => (
              <div key={cat.key} className="mb-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat.label}</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_WIDGETS.filter(w => w.category === cat.key).map(w => {
                    const active = visibleWidgets.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        onClick={() => toggleWidget(w.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {w.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Widgets grid */}
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeWidgets.map(widget => {
            const Icon = widget.icon;
            const value = widget.getValue(stats);
            let colorClass = widget.color;
            if (widget.id === 'true_profit') {
              colorClass = stats.contracts.trueProfitCents >= 0 ? 'text-green-600' : 'text-red-600';
            }
            if (widget.id === 'true_margin') {
              colorClass = stats.contracts.trueMarginPercent >= 30 ? 'text-purple-600' : stats.contracts.trueMarginPercent >= 0 ? 'text-yellow-600' : 'text-red-600';
            }
            return (
              <Card
                key={widget.id}
                className={widget.link ? 'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5' : ''}
                onClick={() => widget.link && pushPath(widget.link)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {widget.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${colorClass}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${
                    widget.id === 'critical_tickets' && (stats.tickets.critical > 0) ? 'text-red-600' :
                    widget.id === 'overdue_invoices' && (stats.invoices.overdue > 0) ? 'text-red-600' :
                    widget.id === 'sla_breached' && (stats.tickets.slaBreached > 0) ? 'text-red-600' :
                    widget.id === 'true_profit' ? colorClass : ''
                  }`}>
                    {value}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mini Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ticket Volume Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Volume (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {ticketVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ticketVolume}>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v: string) => {
                      const d = new Date(v + 'T00:00:00');
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    labelFormatter={(v: any) => {
                      const d = new Date(String(v) + 'T00:00:00');
                      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    }}
                    formatter={(value: any) => [value, 'Tickets']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* SLA Compliance Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">SLA Compliance (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {slaCompliance && slaCompliance.total > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Met', value: slaCompliance.met },
                        { name: 'Breached', value: slaCompliance.breached },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {[0, 1].map(idx => (
                        <Cell key={idx} fill={SLA_COLORS[idx]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-sm">Met: {slaCompliance.met}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm">Breached: {slaCompliance.breached}</span>
                  </div>
                  <div className="text-lg font-bold mt-2">
                    {slaCompliance.total > 0 ? Math.round((slaCompliance.met / slaCompliance.total) * 100) : 100}%
                  </div>
                  <div className="text-xs text-muted-foreground">compliance rate</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No SLA data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
