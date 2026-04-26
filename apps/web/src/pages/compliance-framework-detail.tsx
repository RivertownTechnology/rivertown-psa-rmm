import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ShieldCheck, ChevronDown, ChevronRight, Cpu, FileText, Eye } from 'lucide-react';

interface PolicyArea {
  id: string;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface Control {
  id: string;
  policyAreaId: string;
  controlCode: string;
  title: string;
  description: string | null;
  guidance: string | null;
  nistMapping: string | null;
  severity: string;
  controlType: string;
  assessmentMethod: string | null;
  automationSource: string | null;
  automationCheck: string | null;
  sortOrder: number;
}

interface FrameworkDetail {
  id: string;
  name: string;
  shortName: string;
  version: string | null;
  description: string | null;
  source: string;
  nistMappingEnabled: boolean;
  policyAreas: PolicyArea[];
  controls: Control[];
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

export function ComplianceFrameworkDetailPage({ frameworkId, onBack }: { frameworkId: string; onBack: () => void }) {
  const [framework, setFramework] = useState<FrameworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<FrameworkDetail>('/compliance/frameworks/' + frameworkId);
      setFramework(data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [frameworkId]);

  useEffect(() => { load(); }, [load]);

  function toggleArea(areaId: string) {
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }

  function getControlsForArea(areaId: string): Control[] {
    if (!framework) return [];
    return framework.controls
      .filter(c => c.policyAreaId === areaId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!framework) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Framework not found.</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
        </Button>
      </div>
    );
  }

  const totalControls = framework.controls.length;
  const autoAssessable = framework.controls.filter(c => c.automationSource).length;
  const manualCount = totalControls - autoAssessable;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{framework.name}</h1>
              <Badge variant="outline">{framework.shortName}</Badge>
              {framework.version && (
                <span className="text-sm text-muted-foreground">v{framework.version}</span>
              )}
            </div>
            {framework.description && (
              <p className="text-muted-foreground mt-1 max-w-2xl">{framework.description}</p>
            )}
          </div>
          <Badge variant="secondary">{framework.source}</Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <FileText className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{framework.policyAreas.length}</p>
              <p className="text-xs text-muted-foreground">Policy Areas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <ShieldCheck className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalControls}</p>
              <p className="text-xs text-muted-foreground">Total Controls</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Cpu className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{autoAssessable}</p>
              <p className="text-xs text-muted-foreground">Auto-Assessable</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-2">
              <Eye className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{manualCount}</p>
              <p className="text-xs text-muted-foreground">Manual</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Policy Areas Accordion */}
      <div className="space-y-3">
        {framework.policyAreas
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(area => {
            const areaControls = getControlsForArea(area.id);
            const isExpanded = expandedAreas.has(area.id);

            return (
              <Card key={area.id}>
                <button
                  className="w-full text-left p-4 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-lg"
                  onClick={() => toggleArea(area.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-muted-foreground">{area.code}</span>
                    <span className="font-medium">{area.title}</span>
                    <Badge variant="secondary" className="text-xs">{areaControls.length} controls</Badge>
                  </div>
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && areaControls.length > 0 && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-3 font-medium">Code</th>
                            <th className="text-left p-3 font-medium">Title</th>
                            <th className="text-left p-3 font-medium">Severity</th>
                            <th className="text-left p-3 font-medium">Type</th>
                            <th className="text-left p-3 font-medium">NIST Mapping</th>
                            <th className="text-left p-3 font-medium">Assessment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {areaControls.map(control => (
                            <tr key={control.id} className="border-b last:border-b-0 hover:bg-muted/30">
                              <td className="p-3 font-mono text-xs">{control.controlCode}</td>
                              <td className="p-3">{control.title}</td>
                              <td className="p-3">
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${severityColors[control.severity] || 'bg-gray-100 text-gray-700'}`}>
                                  {control.severity}
                                </span>
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-xs">{control.controlType}</Badge>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground">
                                {control.nistMapping || '—'}
                              </td>
                              <td className="p-3">
                                {control.automationSource ? (
                                  <span className="inline-flex items-center rounded-md bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                                    {control.automationSource}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">
                                    Manual
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
