import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { Plus, ClipboardCheck, Loader2 } from 'lucide-react';

interface Assessment {
  id: string;
  customerId: string;
  frameworkId: string;
  title: string;
  assessmentType: string;
  status: string;
  assessorId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  overallScore: number | null;
  customerName: string;
  frameworkName: string;
  frameworkShortName: string;
  itemCount: number;
}

interface ScopedCustomer {
  id: string;
  name: string;
  scopes: Array<{ frameworkId: string; frameworkName: string; frameworkShortName: string }>;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  in_review: 'In Review',
  completed: 'Completed',
};

const typeLabels: Record<string, string> = {
  baseline: 'Baseline',
  detailed: 'Detailed',
  reassessment: 'Reassessment',
  remediation_check: 'Remediation Check',
};

const typeOptions = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'reassessment', label: 'Reassessment' },
  { value: 'remediation_check', label: 'Remediation Check' },
];

const statusFilterOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
];

function formatScore(score: number | null) {
  if (score === null || score === undefined) return { text: '-', className: 'text-muted-foreground' };
  const pct = Math.round(score);
  if (pct >= 80) return { text: `${pct}%`, className: 'text-green-600 font-medium' };
  if (pct >= 50) return { text: `${pct}%`, className: 'text-yellow-600 font-medium' };
  return { text: `${pct}%`, className: 'text-red-600 font-medium' };
}

export function ComplianceAssessmentsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [scopedCustomers, setScopedCustomers] = useState<ScopedCustomer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [allFrameworks, setAllFrameworks] = useState<Array<{ id: string; name: string; shortName: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    frameworkId: '',
    title: '',
    assessmentType: 'baseline',
    dueDate: '',
  });

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCustomerId) params.set('customerId', filterCustomerId);
      if (filterStatus) params.set('status', filterStatus);
      const qs = params.toString();
      const data = await api<Assessment[]>(`/compliance/assessments${qs ? `?${qs}` : ''}`);
      setAssessments(data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [filterCustomerId, filterStatus]);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  useEffect(() => {
    api<ScopedCustomer[]>('/compliance/scoped-customers').then(setScopedCustomers).catch(() => {});
    api<{ data: Array<{ id: string; name: string }> }>('/customers?limit=100').then(d => setAllCustomers(d.data ?? [])).catch(() => {});
    api<Array<{ id: string; name: string; shortName: string }>>('/compliance/frameworks').then(d => setAllFrameworks(d)).catch(() => {});
  }, []);

  // Customer options for filter (all scoped customers + "All" option)
  const filterCustomerOptions = [
    { value: '', label: 'All Customers' },
    ...scopedCustomers.map(c => ({ value: c.id, label: c.name })),
  ];

  // Customer options for create form — show ALL customers
  const createCustomerOptions = allCustomers.map(c => {
    const scoped = scopedCustomers.find(sc => sc.id === c.id);
    const scopeCount = scoped?.scopes?.length ?? 0;
    return { value: c.id, label: scopeCount > 0 ? `${c.name} (${scopeCount} frameworks)` : c.name };
  });

  // Framework options — show ALL frameworks, indicate if already scoped
  const selectedScopedCustomer = scopedCustomers.find(c => c.id === form.customerId);
  const scopedFwIds = new Set((selectedScopedCustomer?.scopes ?? []).map(s => s.frameworkId));
  const frameworkOptions = allFrameworks.map(f => ({
    value: f.id,
    label: scopedFwIds.has(f.id) ? `${f.name} (${f.shortName})` : `${f.name} (${f.shortName}) — will be scoped`,
  }));

  // Auto-generate title when customer or framework changes
  function handleCustomerChange(customerId: string) {
    setForm(f => ({ ...f, customerId, frameworkId: '', title: '' }));
  }

  function handleFrameworkChange(frameworkId: string) {
    const fw = allFrameworks.find(f => f.id === frameworkId);
    const autoTitle = fw
      ? `${fw.shortName} Assessment — ${new Date().toLocaleDateString()}`
      : '';
    setForm(f => ({ ...f, frameworkId, title: f.title || autoTitle }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Auto-scope customer to framework if not already scoped
      if (!scopedFwIds.has(form.frameworkId)) {
        await api(`/compliance/customers/${form.customerId}/scopes`, {
          method: 'POST',
          body: JSON.stringify({ frameworkId: form.frameworkId }),
        });
      }

      const payload: Record<string, string> = {
        customerId: form.customerId,
        frameworkId: form.frameworkId,
        title: form.title,
        assessmentType: form.assessmentType,
      };
      if (form.dueDate) payload.dueDate = form.dueDate;
      const created = await api<{ id: string }>('/compliance/assessments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      onNavigate(`/compliance/assessments/${created.id}`);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  function openCreateDialog() {
    setForm({ customerId: '', frameworkId: '', title: '', assessmentType: 'baseline', dueDate: '' });
    setShowCreate(true);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Combobox
            options={filterCustomerOptions}
            value={filterCustomerId}
            onValueChange={setFilterCustomerId}
            placeholder="All Customers"
            searchPlaceholder="Search customers..."
            className="w-52"
          />
          <Combobox
            options={statusFilterOptions}
            value={filterStatus}
            onValueChange={setFilterStatus}
            placeholder="All Statuses"
            className="w-44"
          />
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" /> New Assessment
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Assessments</h3>
            <p className="text-muted-foreground mb-4">
              {filterCustomerId || filterStatus
                ? 'No assessments match your filters. Try adjusting your selection.'
                : 'Create your first compliance assessment to get started.'}
            </p>
            {!filterCustomerId && !filterStatus && (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" /> New Assessment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Framework</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(a => {
                  const score = formatScore(a.overallScore);
                  return (
                    <tr
                      key={a.id}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onNavigate(`/compliance/assessments/${a.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium">{a.title}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.customerName}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{a.frameworkShortName}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {typeLabels[a.assessmentType] ?? a.assessmentType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[a.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {statusLabels[a.status] ?? a.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${score.className}`}>{score.text}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {a.completedAt
                          ? new Date(a.completedAt).toLocaleDateString()
                          : a.startedAt
                            ? new Date(a.startedAt).toLocaleDateString()
                            : a.dueDate
                              ? `Due ${new Date(a.dueDate).toLocaleDateString()}`
                              : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Create Assessment Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Assessment</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={createCustomerOptions}
                value={form.customerId}
                onValueChange={handleCustomerChange}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
                emptyText="No customers found."
              />
            </div>
            <div className="space-y-2">
              <Label>Framework</Label>
              <Combobox
                options={frameworkOptions}
                value={form.frameworkId}
                onValueChange={handleFrameworkChange}
                placeholder={form.customerId ? 'Select framework...' : 'Select a customer first'}
                disabled={!form.customerId}
                emptyText="No frameworks available. Import one first."
              />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Assessment title..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assessment Type</Label>
                <Combobox
                  options={typeOptions}
                  value={form.assessmentType}
                  onValueChange={val => setForm(f => ({ ...f, assessmentType: val }))}
                  placeholder="Select type..."
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={saving || !form.customerId || !form.frameworkId || !form.title}
              >
                {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</> : 'Create Assessment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
