import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function CategoriesTab() {
  interface Category { id: string; name: string; sortOrder: number; subcategories: Array<{ id: string; name: string; sortOrder: number }>; }
  const [categories, setCategories] = useState<Category[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({ name: '' });
  const [subSaving, setSubSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSubId, setDeleteSubId] = useState<{ catId: string; subId: string } | null>(null);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    try {
      const data = await api<Category[]>('/ticket-categories');
      setCategories(data);
    } catch { setCategories([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '' }); setShowDialog(true); }
  function openEdit(cat: Category) { setEditId(cat.id); setForm({ name: cat.name }); setShowDialog(true); }
  function openAddSub(catId: string) { setSubParentId(catId); setEditSubId(null); setSubForm({ name: '' }); setShowSubDialog(true); }
  function openEditSub(catId: string, sub: { id: string; name: string }) { setSubParentId(catId); setEditSubId(sub.id); setSubForm({ name: sub.name }); setShowSubDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-categories/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-categories', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadCategories();
    } finally { setSaving(false); }
  }

  async function handleSubSave(e: React.FormEvent) {
    e.preventDefault(); setSubSaving(true);
    try {
      if (editSubId && subParentId) {
        await api(`/settings/ticket-categories/${subParentId}/subcategories/${editSubId}`, { method: 'PATCH', body: JSON.stringify(subForm) });
      } else if (subParentId) {
        await api(`/settings/ticket-categories/${subParentId}/subcategories`, { method: 'POST', body: JSON.stringify(subForm) });
      }
      setShowSubDialog(false); loadCategories();
    } finally { setSubSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-categories/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadCategories();
  }

  async function handleDeleteSub() {
    if (!deleteSubId) return;
    await api(`/settings/ticket-categories/${deleteSubId.catId}/subcategories/${deleteSubId.subId}`, { method: 'DELETE' });
    setDeleteSubId(null); loadCategories();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ticket Categories</CardTitle>
              <CardDescription>Organize tickets into categories and subcategories</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Category</Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No categories yet. Click "Add Category" to create one.</div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="border rounded-lg">
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <span className="font-medium text-sm">{cat.name}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openAddSub(cat.id)}><Plus className="h-3 w-3 mr-1" />Sub</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(cat.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  {cat.subcategories.length > 0 && (
                    <div className="divide-y">
                      {cat.subcategories.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between px-3 py-2 pl-8">
                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSub(cat.id, sub)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeleteSubId({ catId: cat.id, subId: sub.id })}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="Category name" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubDialog} onOpenChange={setShowSubDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editSubId ? 'Edit Subcategory' : 'Add Subcategory'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={subForm.name} onChange={e => setSubForm({ name: e.target.value })} placeholder="Subcategory name" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={subSaving}>{subSaving ? 'Saving...' : editSubId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Category" description="This will delete the category and all its subcategories. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
      <ConfirmDialog open={!!deleteSubId} onOpenChange={() => setDeleteSubId(null)} title="Delete Subcategory" description="This will delete the subcategory. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteSub} />
    </div>
  );
}
