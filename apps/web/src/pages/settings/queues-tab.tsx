import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function QueuesTab() {
  interface Queue { id: string; name: string; description: string | null; color: string; isDefault: boolean; }
  const PRESET_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#6b7280', '#f97316', '#ec4899', '#06b6d4', '#14b8a6'];
  const [queues, setQueues] = useState<Queue[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6', isDefault: false });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadQueues(); }, []);

  async function loadQueues() {
    try {
      const data = await api<Queue[]>('/settings/ticket-queues');
      setQueues(data);
    } catch { setQueues([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '', description: '', color: '#3b82f6', isDefault: false }); setShowDialog(true); }
  function openEdit(q: Queue) { setEditId(q.id); setForm({ name: q.name, description: q.description ?? '', color: q.color, isDefault: q.isDefault }); setShowDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-queues/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-queues', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadQueues();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-queues/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadQueues();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Service Queues</CardTitle>
              <CardDescription>Organize tickets into queues for team routing</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Queue</Button>
          </div>
        </CardHeader>
        <CardContent>
          {queues.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No queues yet. Click "Add Queue" to create one.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {queues.map(q => (
                <div key={q.id} className="border rounded-lg p-4 flex items-start gap-3">
                  <div className="h-3 w-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: q.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{q.name}</span>
                      {q.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                    </div>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(q)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Queue' : 'Add Queue'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Queue name" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" className={`h-7 w-7 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setForm({ ...form, color: c })} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={form.isDefault} onClick={() => setForm({ ...form, isDefault: !form.isDefault })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.isDefault ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.isDefault ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <Label>Default queue</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Queue" description="This will remove the queue. Tickets in this queue will become unqueued." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}
