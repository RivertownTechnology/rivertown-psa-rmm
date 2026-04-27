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

interface CustomFieldDef {
  id: string;
  entityType: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: unknown;
  required: boolean;
  sortOrder: number;
  createdAt: string;
}

function toSnakeCase(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function CustomFieldsTab() {
  const [entityType, setEntityType] = useState('ticket');
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ fieldLabel: '', fieldName: '', fieldType: 'text', options: '', required: false });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadFields(et?: string) {
    setLoading(true);
    try {
      const data = await api<CustomFieldDef[]>(`/settings/custom-fields?entityType=${et || entityType}`);
      setFields(Array.isArray(data) ? data : []);
    } catch { setFields([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadFields(); }, [entityType]);

  function openCreate() {
    setEditingId(null);
    setForm({ fieldLabel: '', fieldName: '', fieldType: 'text', options: '', required: false });
    setShowDialog(true);
  }

  function openEdit(f: CustomFieldDef) {
    setEditingId(f.id);
    const opts = Array.isArray(f.options) ? (f.options as Array<{ value: string; label: string }>).map(o => o.label || o.value).join('\n') : '';
    setForm({ fieldLabel: f.fieldLabel, fieldName: f.fieldName, fieldType: f.fieldType, options: opts, required: f.required });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.fieldLabel.trim()) return;
    setSaving(true);
    try {
      const optionsArr = form.fieldType === 'dropdown' && form.options.trim()
        ? form.options.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map(s => ({ value: toSnakeCase(s), label: s }))
        : null;
      const payload = {
        entityType,
        fieldLabel: form.fieldLabel.trim(),
        fieldName: form.fieldName.trim() || toSnakeCase(form.fieldLabel),
        fieldType: form.fieldType,
        options: optionsArr,
        required: form.required,
      };
      if (editingId) {
        await api(`/settings/custom-fields/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/custom-fields', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false);
      await loadFields();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/custom-fields/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadFields();
  }

  const typeBadge: Record<string, string> = {
    text: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    number: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    dropdown: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    date: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    checkbox: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['ticket', 'customer', 'asset'] as const).map(et => (
            <Button key={et} variant={entityType === et ? 'default' : 'outline'} size="sm"
              onClick={() => setEntityType(et)}>
              {et.charAt(0).toUpperCase() + et.slice(1)}s
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Field</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Label</th>
              <th className="text-left p-3 font-medium">Field Name</th>
              <th className="text-center p-3 font-medium">Type</th>
              <th className="text-center p-3 font-medium">Required</th>
              <th className="w-20"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : fields.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No custom fields defined for {entityType}s. Click "Add Field" to create one.</td></tr>
              ) : fields.map(f => (
                <tr key={f.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{f.fieldLabel}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{f.fieldName}</td>
                  <td className="p-3 text-center"><Badge variant="secondary" className={`text-xs ${typeBadge[f.fieldType] || ''}`}>{f.fieldType}</Badge></td>
                  <td className="p-3 text-center">{f.required && <Badge variant="outline" className="text-xs">Required</Badge>}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <DialogTitle>{editingId ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Field Label</Label>
              <Input value={form.fieldLabel} onChange={e => {
                const label = e.target.value;
                setForm(f => ({ ...f, fieldLabel: label, fieldName: editingId ? f.fieldName : toSnakeCase(label) }));
              }} placeholder="e.g. Location" />
            </div>
            <div className="space-y-2">
              <Label>Field Name (internal)</Label>
              <Input value={form.fieldName} onChange={e => setForm({ ...form, fieldName: e.target.value })} placeholder="auto-generated from label" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <select value={form.fieldType} onChange={e => setForm({ ...form, fieldType: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
            {form.fieldType === 'dropdown' && (
              <div className="space-y-2">
                <Label>Options (one per line or comma-separated)</Label>
                <textarea rows={4} value={form.options} onChange={e => setForm({ ...form, options: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Option 1&#10;Option 2&#10;Option 3" />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="rounded border-gray-300" />
              <span className="text-sm">Required field</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.fieldLabel.trim()}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Custom Field"
        description="Are you sure you want to delete this custom field? All values for this field will also be removed. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
