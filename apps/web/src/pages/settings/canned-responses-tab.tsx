import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Pencil, Trash2, Search } from 'lucide-react';

interface CannedResponse {
  id: string;
  name: string;
  category: string | null;
  body: string;
  isShared: boolean;
  createdAt: string;
}

export function CannedResponsesTab() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: '', body: '', isShared: true });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadResponses() {
    setLoading(true);
    try {
      const data = await api<CannedResponse[]>('/canned-responses');
      setResponses(Array.isArray(data) ? data : []);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadResponses(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', category: '', body: '', isShared: true });
    setShowDialog(true);
  }

  function openEdit(r: CannedResponse) {
    setEditingId(r.id);
    setForm({ name: r.name, category: r.category || '', body: r.body, isShared: r.isShared });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        body: form.body.trim(),
        isShared: form.isShared,
      };
      if (editingId) {
        await api(`/canned-responses/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/canned-responses', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false);
      await loadResponses();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/canned-responses/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadResponses();
  }

  const filtered = responses.filter(r =>
    !searchQuery ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = [...new Set(responses.map(r => r.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Canned Responses</CardTitle>
              <CardDescription>Pre-written replies for common ticket scenarios</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Response</Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search responses..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {responses.length === 0 ? 'No canned responses yet. Create one to get started.' : 'No results match your search.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => (
                <div key={r.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{r.name}</span>
                        {r.category && (
                          <Badge variant="outline" className="text-xs">{r.category}</Badge>
                        )}
                        {r.isShared && (
                          <Badge variant="secondary" className="text-xs">Shared</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{r.body}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Canned Response' : 'New Canned Response'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Password Reset Instructions" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. General, Networking, Email"
                list="canned-categories" />
              {categories.length > 0 && (
                <datalist id="canned-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <textarea
                rows={6}
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="Write the response text..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isShared}
                onChange={e => setForm({ ...form, isShared: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Shared with all technicians</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.body.trim()}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Canned Response"
        description="Are you sure you want to delete this canned response? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
