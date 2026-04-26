import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, ClipboardCheck, AlertTriangle, ListChecks, Library, Activity } from 'lucide-react';

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

  if (loading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate('/compliance/frameworks')}>
          <CardContent className="p-4 text-center">
            <Library className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <div className="text-2xl font-bold">{data?.totalFrameworks ?? 0}</div>
            <div className="text-xs text-muted-foreground">Frameworks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldCheck className="h-6 w-6 mx-auto text-blue-500 mb-2" />
            <div className="text-2xl font-bold">{data?.scopedCustomers ?? 0}</div>
            <div className="text-xs text-muted-foreground">Scoped Customers</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate('/compliance/assessments')}>
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="h-6 w-6 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold">{data?.totalAssessments ?? 0}</div>
            <div className="text-xs text-muted-foreground">Assessments</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate('/compliance/poam')}>
          <CardContent className="p-4 text-center">
            <ListChecks className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
            <div className="text-2xl font-bold text-yellow-600">{data?.openPoamItems ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open POA&M</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate('/compliance/risks')}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-red-500 mb-2" />
            <div className="text-2xl font-bold text-red-600">{data?.openRisks ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open Risks</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" onClick={() => onNavigate('/compliance/frameworks')}>Import Framework</Button>
          <Button variant="outline" onClick={() => onNavigate('/compliance/assessments')}>Start Assessment</Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {data?.recentActivity && data.recentActivity.length > 0 ? (
            <div className="space-y-2">
              {data.recentActivity.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{a.entityType}</Badge>
                    <span>{a.description || `${a.action} on ${a.entityType}`}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No activity yet. Import a framework and start your first assessment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
