import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, X } from 'lucide-react';

export function TagsTab() {
  interface Tag { id: string; name: string; color: string; }
  const PRESET_COLORS = [
    { name: 'Red', value: '#ef4444' }, { name: 'Blue', value: '#3b82f6' }, { name: 'Green', value: '#22c55e' },
    { name: 'Yellow', value: '#eab308' }, { name: 'Purple', value: '#8b5cf6' }, { name: 'Gray', value: '#6b7280' },
    { name: 'Orange', value: '#f97316' }, { name: 'Pink', value: '#ec4899' },
  ];
  const [tags, setTags] = useState<Tag[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    try {
      const data = await api<Tag[]>('/settings/ticket-tags');
      setTags(data);
    } catch { setTags([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '', color: '#3b82f6' }); setShowDialog(true); }
  function openEdit(t: Tag) { setEditId(t.id); setForm({ name: t.name, color: t.color }); setShowDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-tags/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-tags', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadTags();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-tags/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadTags();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ticket Tags</CardTitle>
              <CardDescription>Create color-coded tags for organizing and filtering tickets</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Tag</Button>
          </div>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No tags yet. Click "Add Tag" to create one.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <div key={t.id} className="inline-flex items-center gap-1.5 group">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white cursor-pointer hover:opacity-80" style={{ backgroundColor: t.color }} onClick={() => openEdit(t)}>
                    {t.name}
                  </span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Tag' : 'Add Tag'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tag name" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c.value} type="button" className={`h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center ${form.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c.value }} onClick={() => setForm({ ...form, color: c.value })} title={c.name}>
                    {form.color === c.value && <span className="text-white text-xs font-bold">&#10003;</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: form.color }}>
                  {form.name || 'Preview'}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Tag" description="This will remove the tag from all tickets. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}
