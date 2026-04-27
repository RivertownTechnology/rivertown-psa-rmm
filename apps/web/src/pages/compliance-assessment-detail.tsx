import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getAccessToken, API_BASE } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Minus,
  Circle,
  Loader2,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Upload,
} from 'lucide-react';

// ---------- Types ----------

interface Control {
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
  policyAreaId: string;
}

interface AssessmentItem {
  id: string;
  controlId: string;
  status: string;
  notes: string | null;
  findings: string | null;
  assignedTo: string | null;
  assignedToContact: string | null;
  questionForContact: string | null;
  responseFromContact: string | null;
  responseDate: string | null;
  dueDate: string | null;
  control: Control;
}

interface PolicyArea {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
}

interface Assessment {
  id: string;
  customerId: string;
  frameworkId: string;
  title: string;
  assessmentType: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  findings: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  items: AssessmentItem[];
  policyAreas: PolicyArea[];
}

type ItemStatus = 'compliant' | 'non_compliant' | 'partial' | 'not_applicable' | 'not_assessed';

const STATUS_OPTIONS: { value: ItemStatus; label: string; icon: typeof CheckCircle2; color: string; bgColor: string; activeBg: string }[] = [
  { value: 'compliant', label: 'Compliant', icon: CheckCircle2, color: 'text-green-500',
    bgColor: 'border-border hover:border-green-500/50 hover:bg-green-500/5',
    activeBg: 'border-green-500 bg-green-500/12 text-green-500 shadow-[0_0_8px_rgba(34,197,94,0.15)]' },
  { value: 'non_compliant', label: 'Non-Compliant', icon: XCircle, color: 'text-red-500',
    bgColor: 'border-border hover:border-red-500/50 hover:bg-red-500/5',
    activeBg: 'border-red-500 bg-red-500/12 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.15)]' },
  { value: 'partial', label: 'Partial', icon: AlertTriangle, color: 'text-amber-500',
    bgColor: 'border-border hover:border-amber-500/50 hover:bg-amber-500/5',
    activeBg: 'border-amber-500 bg-amber-500/12 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.15)]' },
  { value: 'not_applicable', label: 'N/A', icon: Minus, color: 'text-slate-400',
    bgColor: 'border-border hover:border-slate-400/50 hover:bg-slate-400/5',
    activeBg: 'border-slate-400 bg-slate-400/10 text-slate-400' },
  { value: 'not_assessed', label: 'Not Assessed', icon: Circle, color: 'text-blue-500',
    bgColor: 'border-border hover:border-blue-500/50 hover:bg-blue-500/5',
    activeBg: 'border-blue-500 bg-blue-500/12 text-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.15)]' },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  in_progress: 'default',
  not_started: 'outline',
  completed: 'secondary',
  cancelled: 'destructive',
};

// ---------- Component ----------

export function ComplianceAssessmentDetailPage({
  assessmentId,
  onBack,
}: {
  assessmentId: string;
  onBack: () => void;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [completeLoading, setCompleteLoading] = useState(false);
  const [poamLoading, setPoamLoading] = useState(false);
  const [completeResult, setCompleteResult] = useState<{ score: number; assessed: number; total: number } | null>(null);
  const [poamResult, setPoamResult] = useState<{ created: number; total: number } | null>(null);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showPoamDialog, setShowPoamDialog] = useState(false);
  const [showRapidDialog, setShowRapidDialog] = useState(false);
  const [rapidAreaId, setRapidAreaId] = useState<string | null>(null);
  const [rapidStatus, setRapidStatus] = useState<ItemStatus>('compliant');
  const [rapidLoading, setRapidLoading] = useState(false);

  // Local editable state for notes/findings per item
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [localFindings, setLocalFindings] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Assessment>(`/compliance/assessments/${assessmentId}`);
      setAssessment(data);
      // Initialize local text state
      const notes: Record<string, string> = {};
      const findings: Record<string, string> = {};
      for (const item of data.items) {
        notes[item.id] = item.notes ?? '';
        findings[item.id] = item.findings ?? '';
      }
      setLocalNotes(notes);
      setLocalFindings(findings);
    } catch {
      /* handled by empty state */
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const isLocked = assessment?.status === 'completed';

  // ---------- Actions ----------

  async function patchItem(itemId: string, patch: Record<string, unknown>) {
    setSavingItems((prev) => new Set(prev).add(itemId));
    try {
      const updated = await api<AssessmentItem>(`/compliance/assessment-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setAssessment((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((it) => (it.id === itemId ? { ...it, ...updated } : it)),
        };
      });
    } catch {
      /* silently fail, item unchanged */
    } finally {
      setSavingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  function handleStatusChange(itemId: string, status: ItemStatus) {
    if (isLocked) return;
    // Optimistic update
    setAssessment((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) => (it.id === itemId ? { ...it, status } : it)),
      };
    });
    patchItem(itemId, { status });
  }

  function handleNotesBlur(itemId: string) {
    if (isLocked) return;
    const val = localNotes[itemId] ?? '';
    const current = assessment?.items.find((it) => it.id === itemId);
    if (current && val !== (current.notes ?? '')) {
      patchItem(itemId, { notes: val });
    }
  }

  function handleFindingsBlur(itemId: string) {
    if (isLocked) return;
    const val = localFindings[itemId] ?? '';
    const current = assessment?.items.find((it) => it.id === itemId);
    if (current && val !== (current.findings ?? '')) {
      patchItem(itemId, { findings: val });
    }
  }

  async function handleComplete() {
    setCompleteLoading(true);
    try {
      const result = await api<{ score: number; assessed: number; total: number }>(
        `/compliance/assessments/${assessmentId}/complete`,
        { method: 'POST' },
      );
      setCompleteResult(result);
      load(); // reload to get updated status
    } catch {
      /* */
    } finally {
      setCompleteLoading(false);
    }
  }

  async function handleGeneratePoam() {
    setPoamLoading(true);
    try {
      const result = await api<{ created: number; total: number }>(
        `/compliance/assessments/${assessmentId}/generate-poam`,
        { method: 'POST' },
      );
      setPoamResult(result);
    } catch {
      /* */
    } finally {
      setPoamLoading(false);
    }
  }

  async function handleRapidAssessment() {
    if (!rapidAreaId || !assessment) return;
    setRapidLoading(true);
    const areaItems = assessment.items.filter(
      (it) => it.control.policyAreaId === rapidAreaId,
    );
    const bulkItems = areaItems.map((it) => ({
      id: it.id,
      status: rapidStatus,
      notes: it.notes ?? '',
    }));
    try {
      await api(`/compliance/assessments/${assessmentId}/items/bulk`, {
        method: 'PUT',
        body: JSON.stringify({ items: bulkItems }),
      });
      load();
    } catch {
      /* */
    } finally {
      setRapidLoading(false);
      setShowRapidDialog(false);
    }
  }

  function toggleArea(areaId: string) {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }

  // ---------- Computed ----------

  const items = assessment?.items ?? [];
  const policyAreas = (assessment?.policyAreas ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const counts = {
    total: items.length,
    compliant: items.filter((i) => i.status === 'compliant').length,
    non_compliant: items.filter((i) => i.status === 'non_compliant').length,
    partial: items.filter((i) => i.status === 'partial').length,
    not_applicable: items.filter((i) => i.status === 'not_applicable').length,
    not_assessed: items.filter((i) => i.status === 'not_assessed').length,
  };
  const assessed = counts.total - counts.not_assessed;

  function areaItems(areaId: string) {
    return items.filter((it) => it.control.policyAreaId === areaId);
  }

  function areaProgress(areaId: string) {
    const ai = areaItems(areaId);
    const done = ai.filter((i) => i.status !== 'not_assessed').length;
    return { done, total: ai.length };
  }

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-full" />
        <div className="grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Assessment not found.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{assessment.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={STATUS_BADGE_VARIANT[assessment.status] ?? 'outline'}>
                {assessment.status.replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {assessment.assessmentType.replace(/_/g, ' ')}
              </Badge>
              {assessment.overallScore !== null && (
                <Badge
                  className={
                    assessment.overallScore >= 80
                      ? 'bg-green-100 text-green-800'
                      : assessment.overallScore >= 50
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }
                >
                  Score: {assessment.overallScore}%
                </Badge>
              )}
              {assessment.dueDate && (
                <span className="text-xs text-muted-foreground">
                  Due: {new Date(assessment.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isLocked && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPoamResult(null);
                  setShowPoamDialog(true);
                }}
              >
                <ListChecks className="h-4 w-4 mr-1" /> Generate POA&M
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setCompleteResult(null);
                  setShowCompleteDialog(true);
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Complete Assessment
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {assessed} of {counts.total} controls assessed
            </span>
            <span className="text-sm text-muted-foreground">
              {counts.total > 0 ? Math.round((assessed / counts.total) * 100) : 0}%
            </span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {counts.total > 0 && (
              <>
                {counts.compliant > 0 && (
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${(counts.compliant / counts.total) * 100}%` }}
                  />
                )}
                {counts.non_compliant > 0 && (
                  <div
                    className="bg-red-500 h-full transition-all"
                    style={{ width: `${(counts.non_compliant / counts.total) * 100}%` }}
                  />
                )}
                {counts.partial > 0 && (
                  <div
                    className="bg-yellow-500 h-full transition-all"
                    style={{ width: `${(counts.partial / counts.total) * 100}%` }}
                  />
                )}
                {counts.not_applicable > 0 && (
                  <div
                    className="bg-blue-400 h-full transition-all"
                    style={{ width: `${(counts.not_applicable / counts.total) * 100}%` }}
                  />
                )}
                {counts.not_assessed > 0 && (
                  <div
                    className="bg-gray-300 h-full transition-all"
                    style={{ width: `${(counts.not_assessed / counts.total) * 100}%` }}
                  />
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Compliant</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Non-Compliant</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Partial</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> N/A</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Not Assessed</span>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{counts.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{counts.compliant}</div>
            <div className="text-xs text-muted-foreground">Compliant</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{counts.non_compliant}</div>
            <div className="text-xs text-muted-foreground">Non-Compliant</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{counts.partial}</div>
            <div className="text-xs text-muted-foreground">Partial</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{counts.not_applicable}</div>
            <div className="text-xs text-muted-foreground">N/A</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-gray-400">{counts.not_assessed}</div>
            <div className="text-xs text-muted-foreground">Not Assessed</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls Grouped by Policy Area */}
      <div className="space-y-2">
        {policyAreas.map((area) => {
          const progress = areaProgress(area.id);
          const expanded = expandedAreas.has(area.id);
          const aItems = areaItems(area.id);

          return (
            <Card key={area.id}>
              <button
                className="w-full text-left"
                onClick={() => toggleArea(area.id)}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-semibold text-sm">
                        {area.code} &mdash; {area.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isLocked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRapidAreaId(area.id);
                            setRapidStatus('compliant');
                            setShowRapidDialog(true);
                          }}
                        >
                          <ListChecks className="h-3 w-3 mr-1" /> Rapid
                        </Button>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {progress.done}/{progress.total} assessed
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </button>

              {expanded && (
                <CardContent className="pt-0 pb-4 px-4 space-y-4">
                  {aItems.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">
                      No controls in this policy area.
                    </p>
                  )}
                  {aItems.map((item) => (
                    <ControlItemRow
                      key={item.id}
                      item={item}
                      isLocked={isLocked}
                      isSaving={savingItems.has(item.id)}
                      localNotes={localNotes[item.id] ?? ''}
                      localFindings={localFindings[item.id] ?? ''}
                      onStatusChange={(status) => handleStatusChange(item.id, status)}
                      onNotesChange={(val) =>
                        setLocalNotes((prev) => ({ ...prev, [item.id]: val }))
                      }
                      onNotesBlur={() => handleNotesBlur(item.id)}
                      onFindingsChange={(val) =>
                        setLocalFindings((prev) => ({ ...prev, [item.id]: val }))
                      }
                      onFindingsBlur={() => handleFindingsBlur(item.id)}
                      customerId={assessment?.customerId}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Items with no matching policy area */}
        {(() => {
          const areaIds = new Set(policyAreas.map((a) => a.id));
          const orphans = items.filter((it) => !areaIds.has(it.control.policyAreaId));
          if (orphans.length === 0) return null;
          const expanded = expandedAreas.has('__orphan__');
          return (
            <Card>
              <button
                className="w-full text-left"
                onClick={() => toggleArea('__orphan__')}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-semibold text-sm">Other Controls</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {orphans.length} controls
                    </Badge>
                  </div>
                </CardHeader>
              </button>
              {expanded && (
                <CardContent className="pt-0 pb-4 px-4 space-y-4">
                  {orphans.map((item) => (
                    <ControlItemRow
                      key={item.id}
                      item={item}
                      isLocked={isLocked}
                      isSaving={savingItems.has(item.id)}
                      localNotes={localNotes[item.id] ?? ''}
                      localFindings={localFindings[item.id] ?? ''}
                      onStatusChange={(status) => handleStatusChange(item.id, status)}
                      onNotesChange={(val) =>
                        setLocalNotes((prev) => ({ ...prev, [item.id]: val }))
                      }
                      onNotesBlur={() => handleNotesBlur(item.id)}
                      onFindingsChange={(val) =>
                        setLocalFindings((prev) => ({ ...prev, [item.id]: val }))
                      }
                      onFindingsBlur={() => handleFindingsBlur(item.id)}
                      customerId={assessment?.customerId}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })()}
      </div>

      {/* Complete Assessment Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Assessment</DialogTitle>
          </DialogHeader>
          {completeResult ? (
            <div className="space-y-3">
              <div className="text-center py-4">
                <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
                <div className="text-2xl font-bold">{completeResult.score}%</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {completeResult.assessed} of {completeResult.total} controls assessed
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowCompleteDialog(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to complete this assessment? This will lock all
                items and calculate the final score.
              </p>
              {counts.not_assessed > 0 && (
                <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 rounded p-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {counts.not_assessed} control{counts.not_assessed !== 1 ? 's' : ''}{' '}
                  still not assessed.
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCompleteDialog(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleComplete} disabled={completeLoading}>
                  {completeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Completing...
                    </>
                  ) : (
                    'Complete Assessment'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate POA&M Dialog */}
      <Dialog open={showPoamDialog} onOpenChange={setShowPoamDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate POA&M</DialogTitle>
          </DialogHeader>
          {poamResult ? (
            <div className="space-y-3">
              <div className="text-center py-4">
                <ListChecks className="h-10 w-10 mx-auto text-blue-500 mb-2" />
                <div className="text-2xl font-bold">{poamResult.created}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  POA&M items created from {poamResult.total} non-compliant controls
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowPoamDialog(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate Plan of Action & Milestones from all non-compliant and
                partially compliant controls in this assessment.
              </p>
              <div className="text-sm">
                <span className="text-red-600 font-medium">{counts.non_compliant}</span>{' '}
                non-compliant,{' '}
                <span className="text-yellow-600 font-medium">{counts.partial}</span>{' '}
                partial controls will be included.
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowPoamDialog(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleGeneratePoam} disabled={poamLoading}>
                  {poamLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...
                    </>
                  ) : (
                    'Generate POA&M'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rapid Assessment Dialog */}
      <Dialog open={showRapidDialog} onOpenChange={setShowRapidDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rapid Assessment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set all controls in{' '}
              <strong>
                {policyAreas.find((a) => a.id === rapidAreaId)?.code}{' '}
                {policyAreas.find((a) => a.id === rapidAreaId)?.title}
              </strong>{' '}
              to a single status.
            </p>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = rapidStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                        isActive ? opt.activeBg : opt.bgColor + ' text-muted-foreground'
                      }`}
                      onClick={() => setRapidStatus(opt.value)}
                    >
                      <Icon className={`h-3.5 w-3.5 ${isActive ? '' : 'text-muted-foreground/60'}`} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {rapidAreaId && (
              <p className="text-xs text-muted-foreground">
                This will update{' '}
                {items.filter((it) => it.control.policyAreaId === rapidAreaId).length}{' '}
                controls.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRapidDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRapidAssessment} disabled={rapidLoading}>
              {rapidLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying...
                </>
              ) : (
                'Apply to All'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Control Item Row ----------

function ControlItemRow({
  item,
  isLocked,
  isSaving,
  localNotes,
  localFindings,
  onStatusChange,
  onNotesChange,
  onNotesBlur,
  onFindingsChange,
  onFindingsBlur,
  customerId,
  controlStatusId,
}: {
  item: AssessmentItem;
  isLocked: boolean;
  isSaving: boolean;
  localNotes: string;
  localFindings: string;
  onStatusChange: (status: ItemStatus) => void;
  onNotesChange: (val: string) => void;
  onNotesBlur: () => void;
  onFindingsChange: (val: string) => void;
  onFindingsBlur: () => void;
  customerId?: string;
  controlStatusId?: string;
}) {
  const ctrl = item.control;
  const showFindings =
    item.status === 'non_compliant' || item.status === 'partial';

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Control Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">
              {ctrl.controlCode}
            </span>
            <span className="text-sm font-medium">{ctrl.title}</span>
            {isSaving && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          {ctrl.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {ctrl.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          <Badge
            className={`text-[10px] ${
              SEVERITY_COLORS[ctrl.severity] ?? 'bg-gray-100 text-gray-800'
            }`}
          >
            {ctrl.severity}
          </Badge>
          {ctrl.nistMapping && (
            <Badge variant="outline" className="text-[10px]">
              {ctrl.nistMapping}
            </Badge>
          )}
          {ctrl.automationSource && (
            <Badge variant="secondary" className="text-[10px]">
              Auto: {ctrl.automationSource}
            </Badge>
          )}
        </div>
      </div>

      {/* Status Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = item.status === opt.value;
          return (
            <button
              key={opt.value}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-150 ${
                isActive
                  ? opt.activeBg
                  : opt.bgColor + ' text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
              onClick={() => onStatusChange(opt.value)}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? '' : 'text-muted-foreground/60'}`} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <textarea
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[60px]"
          rows={2}
          placeholder="Assessment notes..."
          value={localNotes}
          disabled={isLocked}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={onNotesBlur}
        />
      </div>

      {/* Findings (only for non-compliant/partial) */}
      {showFindings && (
        <div>
          <Label className="text-xs text-muted-foreground">Findings</Label>
          <textarea
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[60px]"
            rows={2}
            placeholder="Document findings..."
            value={localFindings}
            disabled={isLocked}
            onChange={(e) => onFindingsChange(e.target.value)}
            onBlur={onFindingsBlur}
          />
        </div>
      )}

      {/* Evidence upload */}
      {customerId && controlStatusId && !isLocked && (
        <div>
          <Label className="text-xs text-muted-foreground">Evidence</Label>
          <div className="mt-1 flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground cursor-pointer transition-colors">
              <Upload className="h-3 w-3" /> Attach File
              <input type="file" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('title', file.name);
                formData.append('evidenceType', 'document');
                formData.append('controlStatusId', controlStatusId);
                try {
                  const token = getAccessToken();
                  await fetch(`${API_BASE}/compliance/customers/${customerId}/evidence/upload`, {
                    method: 'POST',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    body: formData,
                  });
                  // Visual feedback
                  e.target.value = '';
                } catch { /* */ }
              }} />
            </label>
          </div>
        </div>
      )}

      {/* Guidance (collapsible hint) */}
      {ctrl.guidance && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
            Show guidance
          </summary>
          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
            {ctrl.guidance}
          </p>
        </details>
      )}
    </div>
  );
}
