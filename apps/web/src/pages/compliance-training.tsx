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
import { GraduationCap, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';

interface TrainingRecord {
  id: string; customerId: string | null; contactId: string | null; userId: string | null;
  personName: string; trainingType: string; trainingProvider: string | null; courseName: string | null;
  status: string; assignedDate: string | null; dueDate: string | null; completedDate: string | null;
  expirationDate: string | null; score: number | null; externalId: string | null; externalSource: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  assigned: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  expired: 'bg-red-100 text-red-700',
};

const emptyForm = { personName: '', customerId: '', contactId: '', userId: '', trainingType: 'security_awareness', trainingProvider: 'internal', courseName: '', status: 'assigned', assignedDate: '', dueDate: '', completedDate: '', expirationDate: '', score: '', externalId: '', externalSource: '' };

export function ComplianceTrainingPage() {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ customerId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    const data = await api<TrainingRecord[]>(`/compliance/training?${params}`);
    setRecords(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any>('/customers?limit=100').then(d => setCustomers(d.data ?? [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 86400000);

  const completedCount = records.filter(r => r.status === 'completed').length;
  const overdueCount = records.filter(r => r.dueDate && new Date(r.dueDate) < today && r.status !== 'completed').length;
  const expiringSoon = records.filter(r => r.expirationDate && new Date(r.expirationDate) <= soon && new Date(r.expirationDate) > today && r.status === 'completed').length;

  async function handleSave() {
    setSaving(true);
    try {
      const body: any = { ...form, score: form.score !== '' ? Number(form.score) : null };
      if (editingId) {
        await api(`/compliance/training/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/compliance/training', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{records.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-green-600">{completedCount}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-600">{overdueCount}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-yellow-600">{expiringSoon}</p><p className="text-xs text-muted-foreground">Expiring (30d)</p></CardContent></Card>
      </div>

      {overdueCount > 0 && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-800 dark:text-red-300">{overdueCount} training record{overdueCount > 1 ? 's' : ''} overdue</span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 justify-between">
        <Combobox options={[{ value: '', label: 'All / Internal' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter({ customerId: v })} placeholder="All / Internal" className="w-48" />
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> Add Training</Button>
      </div>

      {loading ? <Skeleton className="h-64" /> : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No training records.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Person Name</th>
                <th className="text-left px-4 py-2 font-medium">Training Type</th>
                <th className="text-left px-4 py-2 font-medium">Provider</th>
                <th className="text-left px-4 py-2 font-medium">Course Name</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Assigned</th>
                <th className="text-left px-4 py-2 font-medium">Due Date</th>
                <th className="text-left px-4 py-2 font-medium">Completed</th>
                <th className="text-left px-4 py-2 font-medium">Score</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {records.map(r => {
                  const isOverdue = r.dueDate && new Date(r.dueDate) < today && r.status !== 'completed';
                  return (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-2 font-medium">{r.personName}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.trainingType.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-2 text-muted-foreground">{r.trainingProvider ? r.trainingProvider.replace(/_/g, ' ') : '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.courseName || '—'}</td>
                      <td className="px-4 py-2"><Badge className={`${STATUS_COLORS[r.status] || ''} border-0 text-[10px]`}>{r.status.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-2 text-xs">{r.assignedDate || '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.dueDate ? <span className={isOverdue ? 'text-red-700 font-medium' : ''}>{r.dueDate}</span> : '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.completedDate || '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.score != null ? `${r.score}%` : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(r.id); setForm({ personName: r.personName, customerId: r.customerId || '', contactId: r.contactId || '', userId: r.userId || '', trainingType: r.trainingType, trainingProvider: r.trainingProvider || 'internal', courseName: r.courseName || '', status: r.status, assignedDate: r.assignedDate || '', dueDate: r.dueDate || '', completedDate: r.completedDate || '', expirationDate: r.expirationDate || '', score: r.score != null ? String(r.score) : '', externalId: r.externalId || '', externalSource: r.externalSource || '' }); setShowForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { if (!confirm('Delete?')) return; await api(`/compliance/training/${r.id}`, { method: 'DELETE' }); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Training' : 'Add Training'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Person Name</Label><Input value={form.personName} onChange={e => setForm(f => ({ ...f, personName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Customer</Label><Combobox options={[{ value: '', label: 'Internal Staff' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))} placeholder="Internal..." /></div>
              <div><Label>Course Name</Label><Input value={form.courseName} onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))} placeholder="Course title..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Training Type</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.trainingType} onChange={e => setForm(f => ({ ...f, trainingType: e.target.value }))}><option value="security_awareness">Security Awareness</option><option value="cjis_certification">CJIS Certification</option><option value="hipaa_privacy">HIPAA Privacy</option><option value="hipaa_security">HIPAA Security</option><option value="pci_awareness">PCI Awareness</option><option value="phishing_simulation">Phishing Simulation</option><option value="incident_response">Incident Response</option><option value="custom">Custom</option></select></div>
              <div><Label>Provider</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.trainingProvider} onChange={e => setForm(f => ({ ...f, trainingProvider: e.target.value }))}><option value="huntress">Huntress</option><option value="knowbe4">KnowBe4</option><option value="internal">Internal</option><option value="external">External</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="assigned">Assigned</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option><option value="expired">Expired</option></select></div>
              <div><Label>Score</Label><Input type="number" value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))} placeholder="e.g. 95" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Assigned Date</Label><Input type="date" value={form.assignedDate} onChange={e => setForm(f => ({ ...f, assignedDate: e.target.value }))} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Completed Date</Label><Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} /></div>
              <div><Label>Expiration Date</Label><Input type="date" value={form.expirationDate} onChange={e => setForm(f => ({ ...f, expirationDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>External ID</Label><Input value={form.externalId} onChange={e => setForm(f => ({ ...f, externalId: e.target.value }))} placeholder="External reference..." /></div>
              <div><Label>External Source</Label><Input value={form.externalSource} onChange={e => setForm(f => ({ ...f, externalSource: e.target.value }))} placeholder="Source system..." /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.personName} onClick={handleSave}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
