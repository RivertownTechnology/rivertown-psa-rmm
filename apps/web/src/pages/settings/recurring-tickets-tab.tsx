import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function RecurringTicketsTab() {
  interface RecurringRule {
    id: string; name: string; frequency: string; dayOfWeek: number | null; dayOfMonth: number | null;
    customerId: string | null; customerName?: string; subject: string; description: string | null;
    priority: string; categoryId: string | null; assignedTo: string | null; queueId: string | null;
    isActive: boolean; lastRunAt: string | null; nextRunAt: string | null;
  }
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1,
    customerId: '', subject: '', description: '', priority: 'medium',
    categoryId: '', assignedTo: '', queueId: '', isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [techs, setTechs] = useState<Array<{ id: string; displayName: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [queuesOpts, setQueuesOpts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadRules();
    api<{ data: Array<{ id: string; name: string }> }>('/customers?limit=100').then(d => setCustomers(d.data ?? [])).catch(() => {});
    api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
    api<Array<{ id: string; name: string }>>('/ticket-categories').then(setCategories).catch(() => {});
    api<Array<{ id: string; name: string }>>('/settings/ticket-queues').then(setQueuesOpts).catch(() => {});
  }, []);

  async function loadRules() {
    try { const data = await api<RecurringRule[]>('/settings/recurring-tickets'); setRules(data); }
    catch { setRules([]); }
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, customerId: '', subject: '', description: '', priority: 'medium', categoryId: '', assignedTo: '', queueId: '', isActive: true });
    setShowDialog(true);
  }
  function openEdit(r: RecurringRule) {
    setEditId(r.id);
    setForm({
      name: r.name, frequency: r.frequency, dayOfWeek: r.dayOfWeek ?? 1, dayOfMonth: r.dayOfMonth ?? 1,
      customerId: r.customerId ?? '', subject: r.subject, description: r.description ?? '',
      priority: r.priority, categoryId: r.categoryId ?? '', assignedTo: r.assignedTo ?? '',
      queueId: r.queueId ?? '', isActive: r.isActive,
    });
    setShowDialog(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.customerId) payload.customerId = null;
      if (!payload.categoryId) payload.categoryId = null;
      if (!payload.assignedTo) payload.assignedTo = null;
      if (!payload.queueId) payload.queueId = null;
      if (payload.frequency !== 'weekly') delete payload.dayOfWeek;
      if (payload.frequency !== 'monthly') delete payload.dayOfMonth;
      if (editId) {
        await api(`/settings/recurring-tickets/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/recurring-tickets', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false); loadRules();
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api(`/settings/recurring-tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
    loadRules();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/recurring-tickets/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadRules();
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recurring Tickets</CardTitle>
              <CardDescription>Automatically create tickets on a schedule</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-4">No recurring ticket rules yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Frequency</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Last Run</th>
                <th className="text-left p-3 font-medium">Next Run</th>
                <th className="w-20"></th>
              </tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 capitalize">{r.frequency}{r.frequency === 'weekly' && r.dayOfWeek !== null ? ` (${DAYS[r.dayOfWeek]})` : r.frequency === 'monthly' && r.dayOfMonth ? ` (${r.dayOfMonth}${['st','nd','rd'][r.dayOfMonth-1] || 'th'})` : ''}</td>
                    <td className="p-3 text-muted-foreground">{r.customerName || '-'}</td>
                    <td className="p-3 truncate max-w-[200px]">{r.subject}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleActive(r.id, !r.isActive)}>
                        <Badge variant={r.isActive ? 'default' : 'secondary'} className={r.isActive ? 'bg-green-600' : ''}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                      </button>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{r.lastRunAt ? new Date(r.lastRunAt).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.nextRunAt ? new Date(r.nextRunAt).toLocaleDateString() : '-'}</td>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Recurring Rule' : 'Add Recurring Rule'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Monthly server maintenance" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {form.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: parseInt(e.target.value) })}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Input type="number" min="1" max="28" value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: parseInt(e.target.value) || 1 })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={[{ value: '', label: 'No customer (internal)' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
                value={form.customerId}
                onValueChange={v => setForm({ ...form, customerId: v })}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
              />
            </div>
            <div className="space-y-2"><Label>Subject</Label><Input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ticket subject" /></div>
            <div className="space-y-2"><Label>Description</Label><textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Ticket description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Queue</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.queueId} onChange={e => setForm({ ...form, queueId: e.target.value })}>
                  <option value="">No queue</option>
                  {queuesOpts.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
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

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Rule" description="This will delete the recurring ticket rule. Existing tickets created by this rule will not be affected." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}
