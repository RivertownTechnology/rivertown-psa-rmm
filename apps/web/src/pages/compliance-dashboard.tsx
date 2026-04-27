import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck, ClipboardCheck, AlertTriangle, ListChecks, Library,
  Activity, Users, ArrowRight, TrendingUp, Clock,
} from 'lucide-react';

interface DashboardData {
  scopedCustomers: number;
  totalFrameworks: number;
  openPoamItems: number;
  openRisks: number;
  totalAssessments: number;
  recentActivity: Array<{ id: string; entityType: string; action: string; description: string; createdAt: string }>;
}

export function ComplianceDashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DashboardData>('/compliance/dashboard')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;

  const hasData = (data?.totalFrameworks ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">Compliance Management</h2>
            <p className="text-muted-foreground">CJIS, CMMC, HIPAA, PCI-DSS — manage frameworks, assessments, and audit readiness across all customers.</p>
          </div>
          <ShieldCheck className="h-12 w-12 text-primary/30" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-all group" onClick={() => onNavigate('/compliance/admin')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Library className="h-5 w-5 text-muted-foreground" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold">{data?.totalFrameworks ?? 0}</div>
            <div className="text-xs text-muted-foreground">Frameworks</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all group" onClick={() => onNavigate('/compliance/customers')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-blue-500" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold">{data?.scopedCustomers ?? 0}</div>
            <div className="text-xs text-muted-foreground">Customers</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all group" onClick={() => onNavigate('/compliance/assessments')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <ClipboardCheck className="h-5 w-5 text-green-500" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold">{data?.totalAssessments ?? 0}</div>
            <div className="text-xs text-muted-foreground">Assessments</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all group" onClick={() => onNavigate('/compliance/poam')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <ListChecks className="h-5 w-5 text-amber-500" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{data?.openPoamItems ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open POA&M</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-all group" onClick={() => onNavigate('/compliance/risks')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold text-red-600">{data?.openRisks ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open Risks</div>
          </CardContent>
        </Card>
      </div>

      {!hasData ? (
        /* Getting Started */
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Get Started</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Import a compliance framework, scope a customer, and run your first assessment.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => onNavigate('/compliance/admin')}>
                <Library className="h-4 w-4 mr-2" /> Import Framework
              </Button>
              <Button variant="outline" onClick={() => onNavigate('/compliance/assessments')}>
                <ClipboardCheck className="h-4 w-4 mr-2" /> Start Assessment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => onNavigate('/compliance/assessments')}>
                <ClipboardCheck className="h-4 w-4 mr-2" /> Start New Assessment
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => onNavigate('/compliance/customers')}>
                <Users className="h-4 w-4 mr-2" /> View Compliance Customers
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => onNavigate('/compliance/admin')}>
                <Library className="h-4 w-4 mr-2" /> Manage Frameworks
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => onNavigate('/compliance/incidents')}>
                <AlertTriangle className="h-4 w-4 mr-2" /> Report Security Incident
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Activity</CardTitle></CardHeader>
            <CardContent>
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {data.recentActivity.map(a => (
                    <div key={a.id} className="flex items-start gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-foreground">{a.description || `${a.action} on ${a.entityType}`}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{a.entityType}</Badge>
                          <span className="text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-0.5" />
                            {new Date(a.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
