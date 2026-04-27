import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

interface WorkflowCondition { field: string; operator: string; value: string; }
interface WorkflowAction { type: string; params: Record<string, string>; }
interface WorkflowRule {
  id: string; name: string; description: string | null; trigger: string;
  conditions: WorkflowCondition[]; actions: WorkflowAction[];
  isActive: boolean; executionCount: number;
}

const TRIGGERS = [
  { value: 'ticket_created', label: 'Ticket Created' },
  { value: 'ticket_updated', label: 'Ticket Updated' },
  { value: 'ticket_status_changed', label: 'Status Changed' },
  { value: 'customer_reply', label: 'Customer Reply' },
  { value: 'sla_warning', label: 'SLA Warning' },
];
const CONDITION_FIELDS = [
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
  { value: 'queueId', label: 'Queue' },
  { value: 'customerId', label: 'Customer' },
];
const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In' },
];
const ACTION_TYPES = [
  { value: 'assign_to', label: 'Assign To' },
  { value: 'set_priority', label: 'Set Priority' },
  { value: 'set_status', label: 'Set Status' },
  { value: 'set_queue', label: 'Set Queue' },
  { value: 'send_notification', label: 'Send Notification' },
];

export function WorkflowRulesTab() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', trigger: 'ticket_created',
    conditions: [] as WorkflowCondition[], actions: [] as WorkflowAction[], isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [techs, setTechs] = useState<Array<{ id: string; displayName: string }>>([]);
  const [queuesOpts, setQueuesOpts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadRules();
    api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
    api<Array<{ id: string; name: string }>>('/settings/ticket-queues').then(setQueuesOpts).catch(() => {});
  }, []);

  async function loadRules() {
    try { const data = await api<WorkflowRule[]>('/settings/workflow-rules'); setRules(data); }
    catch { setRules([]); }
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', description: '', trigger: 'ticket_created', conditions: [], actions: [], isActive: true });
    setShowDialog(true);
  }
  function openEdit(r: WorkflowRule) {
    setEditId(r.id);
    setForm({ name: r.name, description: r.description ?? '', trigger: r.trigger, conditions: r.conditions, actions: r.actions, isActive: r.isActive });
    setShowDialog(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      if (editId) {
        await api(`/settings/workflow-rules/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/workflow-rules', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false); loadRules();
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api(`/settings/workflow-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
    loadRules();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/workflow-rules/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadRules();
  }

  function addCondition() {
    setForm({ ...form, conditions: [...form.conditions, { field: 'priority', operator: 'equals', value: '' }] });
  }
  function updateCondition(idx: number, updates: Partial<WorkflowCondition>) {
    setForm({ ...form, conditions: form.conditions.map((c, i) => i === idx ? { ...c, ...updates } : c) });
  }
  function removeCondition(idx: number) {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== idx) });
  }
  function addAction() {
    setForm({ ...form, actions: [...form.actions, { type: 'set_priority', params: {} }] });
  }
  function updateAction(idx: number, updates: Partial<WorkflowAction>) {
    setForm({ ...form, actions: form.actions.map((a, i) => i === idx ? { ...a, ...updates } : a) });
  }
  function removeAction(idx: number) {
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workflow Rules</CardTitle>
              <CardDescription>Automate ticket actions based on triggers and conditions</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-4">No workflow rules yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Trigger</th>
                <th className="text-center p-3 font-medium">Conditions</th>
                <th className="text-center p-3 font-medium">Actions</th>
                <th className="text-center p-3 font-medium">Active</th>
                <th className="text-center p-3 font-medium">Executions</th>
                <th className="w-20"></th>
              </tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3"><div className="font-medium">{r.name}</div>{r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{TRIGGERS.find(t => t.value === r.trigger)?.label || r.trigger}</Badge></td>
                    <td className="p-3 text-center">{r.conditions.length}</td>
                    <td className="p-3 text-center">{r.actions.length}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleActive(r.id, !r.isActive)}>
                        <Badge variant={r.isActive ? 'default' : 'secondary'} className={r.isActive ? 'bg-green-600' : ''}>{r.isActive ? 'On' : 'Off'}</Badge>
                      </button>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">{r.executionCount}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit Workflow Rule' : 'Add Workflow Rule'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rule name" /></div>
              <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {form.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions - rule applies to all tickets matching the trigger</p>}
              {form.conditions.map((cond, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value })}>
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className="px-2 py-1.5 border rounded text-sm bg-background" value={cond.operator} onChange={e => updateCondition(idx, { operator: e.target.value })}>
                    {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Input className="flex-1 h-8" value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })} placeholder="Value" />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCondition(idx)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Actions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAction}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {form.actions.length === 0 && <p className="text-xs text-muted-foreground">No actions - add at least one action</p>}
              {form.actions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <select className="px-2 py-1.5 border rounded text-sm bg-background" value={action.type} onChange={e => updateAction(idx, { type: e.target.value, params: {} })}>
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  {action.type === 'assign_to' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.userId || ''} onChange={e => updateAction(idx, { params: { userId: e.target.value } })}>
                      <option value="">Select tech...</option>
                      {techs.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                    </select>
                  )}
                  {action.type === 'set_priority' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.priority || ''} onChange={e => updateAction(idx, { params: { priority: e.target.value } })}>
                      <option value="">Select...</option>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                    </select>
                  )}
                  {action.type === 'set_status' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.status || ''} onChange={e => updateAction(idx, { params: { status: e.target.value } })}>
                      <option value="">Select...</option>
                      <option value="new">New</option><option value="open">Open</option><option value="pending">Pending</option><option value="waiting_on_customer">Waiting on Customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                    </select>
                  )}
                  {action.type === 'set_queue' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.queueId || ''} onChange={e => updateAction(idx, { params: { queueId: e.target.value } })}>
                      <option value="">Select queue...</option>
                      {queuesOpts.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  )}
                  {action.type === 'send_notification' && (
                    <Input className="flex-1 h-8" value={action.params.message || ''} onChange={e => updateAction(idx, { params: { message: e.target.value } })} placeholder="Notification message" />
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAction(idx)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={form.isActive} onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.isActive ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Rule" description="This will delete the workflow rule. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}
