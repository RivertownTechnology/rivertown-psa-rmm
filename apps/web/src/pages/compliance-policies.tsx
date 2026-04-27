import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Plus, Pencil, Trash2, History, CheckCircle2, Loader2 } from 'lucide-react';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface Policy {
  id: string; customerId: string | null; frameworkId: string | null;
  title: string; policyType: string; content: string | null;
  version: number; status: string; effectiveDate: string | null;
  reviewDate: string | null; aiGenerated: boolean;
  approvedBy: string | null; approvedAt: string | null;
  createdAt: string; updatedAt: string;
}

interface PolicyVersion {
  id: string; version: number; content: string; changedBy: string | null;
  changeNotes: string | null; createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', in_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700', published: 'bg-green-100 text-green-700',
  retired: 'bg-red-100 text-red-700',
};

const TYPES = ['policy', 'procedure', 'standard', 'guideline'];

export function CompliancePoliciesPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [frameworks, setFrameworks] = useState<Array<{ id: string; name: string; shortName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ customerId: '', status: '' });

  // Editor
  const [editing, setEditing] = useState<Policy | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', policyType: 'policy', customerId: '', frameworkId: '' });

  // Version history
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.status) params.set('status', filter.status);
    const data = await api<Policy[]>(`/compliance/policies?${params}`);
    setPolicies(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any>('/compliance/scoped-customers').then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
    api<any>('/compliance/frameworks').then(d => setFrameworks(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));
  const fwMap = new Map(frameworks.map(f => [f.id, f]));

  async function createPolicy() {
    setSaving(true);
    try {
      const res = await api<Policy>('/compliance/policies', { method: 'POST', body: JSON.stringify(createForm) });
      setShowCreate(false);
      setEditing(res);
      setEditorContent(res.content || '');
      load();
    } finally { setSaving(false); }
  }

  async function savePolicy() {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api<Policy>(`/compliance/policies/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editorContent }),
      });
      setEditing(updated);
      load();
    } finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: string) {
    await api(`/compliance/policies/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (editing?.id === id) {
      setEditing({ ...editing, status });
    }
    load();
  }

  async function loadVersions(policyId: string) {
    const data = await api<PolicyVersion[]>(`/compliance/policies/${policyId}/versions`);
    setVersions(data);
    setShowVersions(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex gap-2">
          <Combobox options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter(f => ({ ...f, customerId: v }))} placeholder="All Customers" className="w-48" />
          <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        <Button size="sm" onClick={() => { setCreateForm({ title: '', policyType: 'policy', customerId: '', frameworkId: '' }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Policy
        </Button>
      </div>

      {editing ? (
        /* Policy Editor */
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{editing.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{editing.policyType}</Badge>
                  <Badge className={`${STATUS_COLORS[editing.status] || ''} border-0 text-[10px]`}>{editing.status}</Badge>
                  <span className="text-xs text-muted-foreground">v{editing.version}</span>
                  {editing.customerId && <span className="text-xs text-muted-foreground">— {custMap.get(editing.customerId)}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => loadVersions(editing.id)}><History className="h-4 w-4 mr-1" /> History</Button>
                {editing.status === 'draft' && <Button variant="outline" size="sm" onClick={() => updateStatus(editing.id, 'in_review')}>Submit for Review</Button>}
                {editing.status === 'in_review' && <Button variant="outline" size="sm" onClick={() => updateStatus(editing.id, 'approved')}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>}
                {editing.status === 'approved' && <Button variant="outline" size="sm" onClick={() => updateStatus(editing.id, 'published')}>Publish</Button>}
                <Button size="sm" disabled={saving} onClick={savePolicy}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</> : 'Save'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Close</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[400px] resize-y font-mono"
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              placeholder="Write your policy content here using Markdown..."
            />
          </CardContent>
        </Card>
      ) : loading ? <Skeleton className="h-64" /> : policies.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No policies yet. Create your first policy or generate one with AI.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Framework</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-center px-4 py-2 font-medium">Ver</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {policies.map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => { setEditing(p); setEditorContent(p.content || ''); }}>
                    <td className="px-4 py-2 font-medium">{p.title}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{p.policyType}</Badge></td>
                    <td className="px-4 py-2 text-muted-foreground">{p.customerId ? custMap.get(p.customerId) || '—' : 'Template'}</td>
                    <td className="px-4 py-2">{p.frameworkId ? <Badge variant="secondary" className="text-[10px]">{fwMap.get(p.frameworkId)?.shortName || '—'}</Badge> : '—'}</td>
                    <td className="px-4 py-2"><Badge className={`${STATUS_COLORS[p.status] || ''} border-0 text-[10px]`}>{p.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2 text-center text-xs">{p.version}</td>
                    <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { const ok = await confirm({ title: 'Retire Policy?', description: 'This action cannot be undone.', confirmLabel: 'Retire' }); if (!ok) return; await api(`/compliance/policies/${p.id}`, { method: 'DELETE' }); toast.success('Deleted successfully'); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Policy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Acceptable Use Policy" /></div>
            <div><Label>Type</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={createForm.policyType} onChange={e => setCreateForm(f => ({ ...f, policyType: e.target.value }))}>
              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select></div>
            <div><Label>Customer</Label><Combobox options={[{ value: '', label: 'Template (no customer)' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={createForm.customerId} onValueChange={v => setCreateForm(f => ({ ...f, customerId: v }))} placeholder="Template..." /></div>
            <div><Label>Framework</Label><Combobox options={[{ value: '', label: 'None' }, ...frameworks.map(f => ({ value: f.id, label: f.name }))]} value={createForm.frameworkId} onValueChange={v => setCreateForm(f => ({ ...f, frameworkId: v }))} placeholder="None..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={saving || !createForm.title} onClick={createPolicy}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Version History</DialogTitle></DialogHeader>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No previous versions.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {versions.map(v => (
                <Card key={v.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">Version {v.version}</span>
                      <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                    </div>
                    {v.changeNotes && <p className="text-xs text-muted-foreground mb-1">{v.changeNotes}</p>}
                    <pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">{v.content.substring(0, 500)}{v.content.length > 500 ? '...' : ''}</pre>
                    {editing && <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => { setEditorContent(v.content); setShowVersions(false); }}>Restore this version</Button>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
