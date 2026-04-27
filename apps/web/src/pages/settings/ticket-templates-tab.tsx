import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface TicketTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
  priority: string;
  category: string;
}

export function TicketTemplatesTab() {
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', subject: '', body: '', priority: 'medium', category: '' });
  const [saving, setSaving] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await api<TicketTemplate[]>('/settings/ticket-templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch { setTemplates([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTemplates(); }, []);

  function openCreate() {
    setEditingIdx(null);
    setForm({ name: '', description: '', subject: '', body: '', priority: 'medium', category: '' });
    setShowDialog(true);
  }

  function openEdit(idx: number) {
    const t = templates[idx];
    setEditingIdx(idx);
    setForm({ name: t.name, description: t.description || '', subject: t.subject || '', body: t.body || '', priority: t.priority || 'medium', category: t.category || '' });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const entry: TicketTemplate = {
        id: editingIdx !== null ? templates[editingIdx].id : crypto.randomUUID(),
        name: form.name.trim(),
        description: form.description.trim(),
        subject: form.subject.trim(),
        body: form.body.trim(),
        priority: form.priority,
        category: form.category.trim(),
      };
      let updated: TicketTemplate[];
      if (editingIdx !== null) {
        updated = templates.map((t, i) => i === editingIdx ? entry : t);
      } else {
        updated = [...templates, entry];
      }
      await api('/settings/ticket-templates', { method: 'PUT', body: JSON.stringify(updated) });
      setShowDialog(false);
      await loadTemplates();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (deleteIdx === null) return;
    const updated = templates.filter((_, i) => i !== deleteIdx);
    await api('/settings/ticket-templates', { method: 'PUT', body: JSON.stringify(updated) });
    setDeleteIdx(null);
    await loadTemplates();
  }

  const priorityLabel: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Ticket Templates</h3>
          <p className="text-xs text-muted-foreground">Pre-fill ticket fields for common requests</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Template</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Subject</th>
              <th className="text-center p-3 font-medium">Priority</th>
              <th className="text-left p-3 font-medium">Category</th>
              <th className="w-20"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No ticket templates yet. Click "Add Template" to create one.</td></tr>
              ) : templates.map((t, idx) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{t.subject || '-'}</td>
                  <td className="p-3 text-center"><Badge variant="outline" className="text-xs capitalize">{priorityLabel[t.priority] || t.priority}</Badge></td>
                  <td className="p-3 text-muted-foreground">{t.category || '-'}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(idx)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteIdx(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIdx !== null ? 'Edit Template' : 'Add Ticket Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. New Employee Onboarding" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of when to use this template" />
            </div>
            <div className="space-y-2">
              <Label>Default Subject</Label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Subject line for the ticket" />
            </div>
            <div className="space-y-2">
              <Label>Default Description</Label>
              <textarea rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Pre-filled ticket description..." />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Optional category name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : editingIdx !== null ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteIdx !== null}
        onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}
        title="Delete Template"
        description="Are you sure you want to delete this ticket template? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
