import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Search, Trash2, Edit2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LibraryItem {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[] | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'resumes', label: 'Resumes' },
  { value: 'case_studies', label: 'Case Studies' },
  { value: 'certifications', label: 'Certifications' },
  { value: 'boilerplate', label: 'Boilerplate' },
  { value: 'past_performance', label: 'Past Performance' },
];

const CATEGORY_COLORS: Record<string, string> = {
  resumes: 'bg-blue-100 text-blue-700',
  case_studies: 'bg-purple-100 text-purple-700',
  certifications: 'bg-green-100 text-green-700',
  boilerplate: 'bg-orange-100 text-orange-700',
  past_performance: 'bg-indigo-100 text-indigo-700',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GovLibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'boilerplate', content: '', tags: '' });

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: LibraryItem[] }>('/gov/library?limit=500');
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = items.filter(item => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingItem(null);
    setForm({ title: '', category: 'boilerplate', content: '', tags: '' });
    setDialogOpen(true);
  }

  function openEdit(item: LibraryItem) {
    setEditingItem(item);
    setForm({
      title: item.title,
      category: item.category,
      content: item.content,
      tags: item.tags?.join(', ') ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.content) return;
    setSaving(true);
    try {
      const body = {
        title: form.title,
        category: form.category,
        content: form.content,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      if (editingItem) {
        await api(`/gov/library/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/gov/library', { method: 'POST', body: JSON.stringify(body) });
      }
      setDialogOpen(false);
      fetchItems();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function handleDeleteClick(id: string) {
    setDeleteId(id);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api(`/gov/library/${deleteId}`, { method: 'DELETE' });
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchItems();
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2"><Skeleton className="h-9 w-64" /><Skeleton className="h-9 w-32" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search library..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={openCreate} className="ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              categoryFilter === cat.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} className="group relative">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold truncate flex-1">{item.title}</h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteClick(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Badge className={`text-[10px] mb-2 ${CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-700'}`}>
                  {item.category.replace(/_/g, ' ')}
                </Badge>
                <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{item.content}</p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {item.lastUsedAt ? `Last used ${new Date(item.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                  </span>
                  <span>{item.useCount} use{item.useCount !== 1 ? 's' : ''}</span>
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1.5">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery || categoryFilter ? 'No items match your filters.' : 'No library items yet. Add your first item to get started.'}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Library Item'}</DialogTitle>
            <DialogDescription>{editingItem ? 'Update this library item.' : 'Add reusable content for proposals.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Item title" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resumes">Resumes</SelectItem>
                  <SelectItem value="case_studies">Case Studies</SelectItem>
                  <SelectItem value="certifications">Certifications</SelectItem>
                  <SelectItem value="boilerplate">Boilerplate</SelectItem>
                  <SelectItem value="past_performance">Past Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Content *</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[200px] resize-y"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Content..."
              />
            </div>
            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Comma separated tags" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.content}>
              {saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Library Item"
        description="Are you sure you want to delete this library item? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
