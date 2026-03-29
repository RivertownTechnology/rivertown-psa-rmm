import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCentsShort } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Ticket, Building2, Clock, AlertTriangle, DollarSign, TrendingUp,
  PieChart, Receipt, FileText, ShieldAlert, Eye, EyeOff, Settings2,
} from 'lucide-react';

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
}

const ALL_WIDGETS: Widget[] = [
  // General
  { id: 'customers', title: 'Customers', getValue: s => s.customers.total, icon: Building2, color: 'text-blue-600', category: 'general' },
  { id: 'open_tickets', title: 'Open Tickets', getValue: s => s.tickets.open, icon: Ticket, color: 'text-green-600', category: 'general' },
  { id: 'new_tickets', title: 'New Tickets', getValue: s => s.tickets.new, icon: Ticket, color: 'text-blue-500', category: 'general' },
  { id: 'critical_tickets', title: 'Critical Tickets', getValue: s => s.tickets.critical, icon: AlertTriangle, color: 'text-red-600', category: 'general' },
  { id: 'sla_breached', title: 'SLA Breached', getValue: s => s.tickets.slaBreached, icon: ShieldAlert, color: 'text-red-500', category: 'general' },
  { id: 'unbilled_hours', title: 'Unbilled Hours', getValue: s => s.labor.unbilledHours, icon: Clock, color: 'text-orange-600', category: 'general' },
  { id: 'total_labor_hours', title: 'Total Labor Hours', getValue: s => s.labor.totalHours, icon: Clock, color: 'text-purple-600', category: 'general' },
  // Billing
  { id: 'open_invoices', title: 'Open Invoices', getValue: s => s.invoices.open, icon: Receipt, color: 'text-blue-600', category: 'billing' },
  { id: 'overdue_invoices', title: 'Overdue Invoices', getValue: s => s.invoices.overdue, icon: Receipt, color: 'text-red-600', category: 'billing' },
  { id: 'outstanding', title: 'Outstanding', getValue: s => formatCentsShort(s.invoices.outstandingCents), icon: DollarSign, color: 'text-orange-600', category: 'billing' },
  { id: 'paid_this_month', title: 'Paid This Month', getValue: s => formatCentsShort(s.invoices.paidThisMonthCents), icon: DollarSign, color: 'text-green-600', category: 'billing' },
  // Financial (company-wide P&L)
  { id: 'monthly_revenue', title: 'Monthly Revenue', getValue: s => formatCentsShort(s.contracts.monthlyRevenueCents), icon: DollarSign, color: 'text-green-600', category: 'financial' },
  { id: 'product_cost', title: 'Product Cost', getValue: s => formatCentsShort(s.contracts.productCostCents), icon: DollarSign, color: 'text-red-500', category: 'financial' },
  { id: 'labor_cost', title: 'Labor Cost', getValue: s => formatCentsShort(s.contracts.laborCostCents), icon: Clock, color: 'text-orange-500', category: 'financial' },
  { id: 'true_profit', title: 'True Profit', getValue: s => formatCentsShort(s.contracts.trueProfitCents), icon: TrendingUp, color: 'text-green-600', category: 'financial' },
  { id: 'true_margin', title: 'True Margin', getValue: s => `${s.contracts.trueMarginPercent}%`, icon: PieChart, color: 'text-purple-600', category: 'financial' },
];

const DEFAULT_VISIBLE = ['customers', 'open_tickets', 'critical_tickets', 'unbilled_hours', 'open_invoices', 'overdue_invoices', 'monthly_revenue', 'true_profit'];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const stored = localStorage.getItem('dashboard-widgets');
    return stored ? JSON.parse(stored) : DEFAULT_VISIBLE;
  });
  const [showConfig, setShowConfig] = useState(false);

  const fetchStats = useCallback(() => {
    api<DashboardStats>('/dashboard/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    function onVisible() { if (document.visibilityState === 'visible') fetchStats(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('popstate', fetchStats);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('popstate', fetchStats);
    };
  }, [fetchStats]);

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
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeWidgets.map(widget => {
            const Icon = widget.icon;
            const value = widget.getValue(stats);
            // Dynamic color for profit
            let colorClass = widget.color;
            if (widget.id === 'true_profit') {
              colorClass = stats.contracts.trueProfitCents >= 0 ? 'text-green-600' : 'text-red-600';
            }
            if (widget.id === 'true_margin') {
              colorClass = stats.contracts.trueMarginPercent >= 30 ? 'text-purple-600' : stats.contracts.trueMarginPercent >= 0 ? 'text-yellow-600' : 'text-red-600';
            }
            return (
              <Card key={widget.id}>
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
      )}

      {!stats && (
        <div className="text-center text-muted-foreground py-12">Loading dashboard...</div>
      )}
    </div>
  );
}
