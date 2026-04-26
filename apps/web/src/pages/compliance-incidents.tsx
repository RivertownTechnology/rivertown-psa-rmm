import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Plus, Pencil, Trash2 } from 'lucide-react';

interface IncidentRecord {
  id: string; customerId: string; incidentNumber: number; title: string;
  description: string | null; incidentType: string; severity: string;
  dataTypes: string[]; affectedIndividuals: number | null;
  discoveredAt: string | null; reportedAt: string | null;
  containedAt: string | null; resolvedAt: string | null;
  reportedTo: any; breachNotification: any;
  rootCause: string | null; remediationActions: string | null;
  lessonsLearned: string | null; status: string; ticketId: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700', low: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700', investigating: 'bg-blue-100 text-blue-700',
  contained: 'bg-yellow-100 text-yellow-700', resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

const TYPE_LABELS: Record<string, string> = {
  data_breach: 'Data Breach', unauthorized_access: 'Unauthorized Access',
  malware: 'Malware', phishing: 'Phishing', physical_security: 'Physical Security',
  policy_violation: 'Policy Violation', system_outage: 'System Outage', other: 'Other',
};

const DATA_TYPE_OPTIONS = [
  { value: 'cji', label: 'CJI' },
  { value: 'phi', label: 'PHI' },
  { value: 'pii', label: 'PII' },
  { value: 'cardholder', label: 'Cardholder' },
];

const emptyForm = {
  title: '', description: '', incidentType: 'data_breach', severity: 'medium',
  dataTypes: [] as string[], affectedIndividuals: '', customerId: '',
  discoveredAt: '', reportedAt: '', containedAt: '', resolvedAt: '',
  rootCause: '', remediationActions: '', lessonsLearned: '', status: 'open',
  breachNotificationRequired: false, breachNotificationDeadline: '', breachNotificationSentDate: '',
};

export function ComplianceIncidentsPage() {
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ customerId: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.status) params.set('status', filter.status);
    const data = await api<IncidentRecord[]>(`/compliance/incidents?${params}`);
    setRecords(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any>('/compliance/scoped-customers').then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  const openCount = records.filter(r => r.status === 'open').length;
  const investigatingCount = records.filter(r => r.status === 'investigating').length;
  const thisYear = new Date().getFullYear();
  const totalThisYear = records.filter(r => {
    const d = r.discoveredAt ? new Date(r.discoveredAt) : null;
    return d && d.getFullYear() === thisYear;
  }).length;

  function openEdit(r: IncidentRecord) {
    setEditingId(r.id);
    setForm({
      title: r.title, description: r.description || '', incidentType: r.incidentType,
      severity: r.severity, dataTypes: r.dataTypes || [],
      affectedIndividuals: r.affectedIndividuals != null ? String(r.affectedIndividuals) : '',
      customerId: r.customerId || '', discoveredAt: r.discoveredAt || '',
      reportedAt: r.reportedAt || '', containedAt: r.containedAt || '',
      resolvedAt: r.resolvedAt || '', rootCause: r.rootCause || '',
      remediationActions: r.remediationActions || '', lessonsLearned: r.lessonsLearned || '',
      status: r.status,
      breachNotificationRequired: r.breachNotification?.required ?? false,
      breachNotificationDeadline: r.breachNotification?.deadline || '',
      breachNotificationSentDate: r.breachNotification?.sentDate || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...form,
        affectedIndividuals: form.affectedIndividuals ? Number(form.affectedIndividuals) : null,
        breachNotification: {
          required: form.breachNotificationRequired,
          deadline: form.breachNotificationDeadline || null,
          sentDate: form.breachNotificationSentDate || null,
        },
      };
      const { breachNotificationRequired, breachNotificationDeadline, breachNotificationSentDate, ...payload } = body as any;
      if (editingId) {
        await api(`/compliance/incidents/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/compliance/incidents', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  function toggleDataType(dt: string) {
    setForm(f => ({
      ...f,
      dataTypes: f.dataTypes.includes(dt) ? f.dataTypes.filter(t => t !== dt) : [...f.dataTypes, dt],
    }));
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`cursor-pointer ${filter.status === 'open' ? 'border-primary' : ''}`} onClick={() => setFilter(f => ({ ...f, status: f.status === 'open' ? '' : 'open' }))}>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-red-600">{openCount}</div>
            <div className="text-xs text-muted-foreground">Open</div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer ${filter.status === 'investigating' ? 'border-primary' : ''}`} onClick={() => setFilter(f => ({ ...f, status: f.status === 'investigating' ? '' : 'investigating' }))}>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{investigatingCount}</div>
            <div className="text-xs text-muted-foreground">Investigating</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold">{totalThisYear}</div>
            <div className="text-xs text-muted-foreground">Total This Year</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Add */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Combobox options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter(f => ({ ...f, customerId: v }))} placeholder="All Customers" className="w-48" />
          <select className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="contained">Contained</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> Add Incident</Button>
      </div>

      {/* Table */}
      {loading ? <Skeleton className="h-64" /> : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No security incidents recorded.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-center px-4 py-2 font-medium">Severity</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Discovered</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.incidentNumber}</td>
                    <td className="px-4 py-2 max-w-[250px]"><div className="truncate font-medium">{r.title}</div></td>
                    <td className="px-4 py-2 text-muted-foreground">{custMap.get(r.customerId) || '—'}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{TYPE_LABELS[r.incidentType] || r.incidentType}</Badge></td>
                    <td className="px-4 py-2 text-center"><Badge className={`${SEVERITY_COLORS[r.severity] || ''} border-0 text-[10px]`}>{r.severity}</Badge></td>
                    <td className="px-4 py-2"><Badge className={`${STATUS_COLORS[r.status] || ''} border-0 text-[10px]`}>{r.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.discoveredAt || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { if (!confirm('Delete this incident?')) return; await api(`/compliance/incidents/${r.id}`, { method: 'DELETE' }); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Incident' : 'Add Incident'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Description</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Incident Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.incidentType} onChange={e => setForm(f => ({ ...f, incidentType: e.target.value }))}>
                  <option value="data_breach">Data Breach</option>
                  <option value="unauthorized_access">Unauthorized Access</option>
                  <option value="malware">Malware</option>
                  <option value="phishing">Phishing</option>
                  <option value="physical_security">Physical Security</option>
                  <option value="policy_violation">Policy Violation</option>
                  <option value="system_outage">System Outage</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div><Label>Severity</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Customer</Label><Combobox options={[{ value: '', label: 'Select...' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))} placeholder="Select..." /></div>
              <div><Label>Status</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="contained">Contained</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            {/* Data Types */}
            <div>
              <Label>Data Types Affected</Label>
              <div className="flex items-center gap-4 mt-1">
                {DATA_TYPE_OPTIONS.map(dt => (
                  <label key={dt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="rounded border-input" checked={form.dataTypes.includes(dt.value)} onChange={() => toggleDataType(dt.value)} />
                    {dt.label}
                  </label>
                ))}
              </div>
            </div>

            <div><Label>Affected Individuals</Label><Input type="number" value={form.affectedIndividuals} onChange={e => setForm(f => ({ ...f, affectedIndividuals: e.target.value }))} placeholder="Number of affected individuals" /></div>

            {/* Timeline Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Discovered</Label><Input type="date" value={form.discoveredAt} onChange={e => setForm(f => ({ ...f, discoveredAt: e.target.value }))} /></div>
              <div><Label>Reported</Label><Input type="date" value={form.reportedAt} onChange={e => setForm(f => ({ ...f, reportedAt: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contained</Label><Input type="date" value={form.containedAt} onChange={e => setForm(f => ({ ...f, containedAt: e.target.value }))} /></div>
              <div><Label>Resolved</Label><Input type="date" value={form.resolvedAt} onChange={e => setForm(f => ({ ...f, resolvedAt: e.target.value }))} /></div>
            </div>

            <div><Label>Root Cause</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={form.rootCause} onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))} /></div>
            <div><Label>Remediation Actions</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={form.remediationActions} onChange={e => setForm(f => ({ ...f, remediationActions: e.target.value }))} /></div>
            <div><Label>Lessons Learned</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={form.lessonsLearned} onChange={e => setForm(f => ({ ...f, lessonsLearned: e.target.value }))} /></div>

            {/* Breach Notification Section */}
            <div className="border rounded-md p-3 space-y-3">
              <Label className="text-sm font-semibold">Breach Notification</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded border-input" checked={form.breachNotificationRequired} onChange={e => setForm(f => ({ ...f, breachNotificationRequired: e.target.checked }))} />
                Notification Required
              </label>
              {form.breachNotificationRequired && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Deadline</Label><Input type="date" value={form.breachNotificationDeadline} onChange={e => setForm(f => ({ ...f, breachNotificationDeadline: e.target.value }))} /></div>
                  <div><Label>Sent Date</Label><Input type="date" value={form.breachNotificationSentDate} onChange={e => setForm(f => ({ ...f, breachNotificationSentDate: e.target.value }))} /></div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.title || !form.customerId} onClick={handleSave}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
