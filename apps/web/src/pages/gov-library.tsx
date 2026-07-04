import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, apiAllPages } from '@/lib/api';
import { useToast } from '@/lib/toast';
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
  Plus, Search, Trash2, Edit2, Copy, Library, X, ArrowUpDown, Clock, Eye,
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

type SortOption = 'recent' | 'lastUsed' | 'mostUsed' | 'alpha';

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

const CATEGORY_DOT_COLORS: Record<string, string> = {
  resumes: 'bg-blue-500',
  case_studies: 'bg-purple-500',
  certifications: 'bg-green-500',
  boilerplate: 'bg-orange-500',
  past_performance: 'bg-indigo-500',
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recently Created' },
  { value: 'lastUsed', label: 'Last Used' },
  { value: 'mostUsed', label: 'Most Used' },
  { value: 'alpha', label: 'Alphabetical' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

function sortItems(items: LibraryItem[], sort: SortOption): LibraryItem[] {
  const sorted = [...items];
  switch (sort) {
    case 'recent':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'lastUsed':
      return sorted.sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return 0;
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
      });
    case 'mostUsed':
      return sorted.sort((a, b) => b.useCount - a.useCount);
    case 'alpha':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return sorted;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GovLibraryPage() {
  const toast = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'boilerplate', content: '', tags: '' });

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Preview state
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiAllPages<LibraryItem>('/gov/library'));
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
  // Filter & Sort
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const base = items.filter(item => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(q) && !item.content.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return sortItems(base, sortBy);
  }, [items, categoryFilter, searchQuery, sortBy]);

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const byCat: Record<string, number> = {};
    let latestUpdate = '';
    for (const item of items) {
      byCat[item.category] = (byCat[item.category] || 0) + 1;
      if (!latestUpdate || item.updatedAt > latestUpdate) {
        latestUpdate = item.updatedAt;
      }
    }
    return { total: items.length, byCat, latestUpdate };
  }, [items]);

  // ---------------------------------------------------------------------------
  // Form tag parsing for badge preview
  // ---------------------------------------------------------------------------

  const parsedTags = useMemo(() => {
    return form.tags
      ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
  }, [form.tags]);

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
        toast.success('Item updated', 'Library item has been updated successfully.');
      } else {
        await api('/gov/library', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Item created', 'New library item has been added.');
      }
      setDialogOpen(false);
      fetchItems();
    } catch {
      toast.error('Save failed', 'Something went wrong while saving the item.');
    } finally {
      setSaving(false);
    }
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
      // Close preview if we just deleted the previewed item
      if (previewItem?.id === deleteId) setPreviewItem(null);
      toast.success('Item deleted', 'Library item has been removed.');
      fetchItems();
    } catch {
      toast.error('Delete failed', 'Something went wrong while deleting the item.');
    }
  }

  function handleCardClick(item: LibraryItem) {
    setPreviewItem(prev => (prev?.id === item.id ? null : item));
  }

  async function handleCopyToClipboard(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied', 'Content copied to clipboard.');
    } catch {
      toast.error('Copy failed', 'Unable to copy content to clipboard.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{stats.total} item{stats.total !== 1 ? 's' : ''}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        {CATEGORIES.filter(c => c.value).map(cat => {
          const count = stats.byCat[cat.value] || 0;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(prev => prev === cat.value ? '' : cat.value)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${CATEGORY_DOT_COLORS[cat.value] ?? 'bg-gray-400'}`} />
              <span>{cat.label}</span>
              <span className="font-semibold text-foreground">{count}</span>
            </button>
          );
        })}
        {stats.latestUpdate && (
          <>
            <div className="h-4 w-px bg-border ml-auto" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Updated {relativeTime(stats.latestUpdate)}</span>
            </div>
          </>
        )}
      </div>

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
        <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <Card
              key={item.id}
              className={`group relative cursor-pointer transition-shadow hover:shadow-md ${
                previewItem?.id === item.id ? 'ring-2 ring-primary' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3
                    className="text-sm font-semibold truncate flex-1"
                    onClick={() => handleCardClick(item)}
                  >
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(item); }}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); handleDeleteClick(item.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="mb-2" onClick={() => handleCardClick(item)}>
                  <Badge className={`text-xs px-2.5 py-0.5 ${CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-700'}`}>
                    {item.category.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p
                  className="text-xs text-muted-foreground line-clamp-4 mb-3 cursor-pointer"
                  onClick={() => handleCardClick(item)}
                >
                  {item.content}
                </p>
                <div
                  className="flex items-center justify-between text-[10px] text-muted-foreground"
                  onClick={() => handleCardClick(item)}
                >
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {relativeTime(item.updatedAt)}
                  </span>
                  <span>{wordCount(item.content)} words</span>
                </div>
                <div
                  className="flex items-center justify-between text-[10px] text-muted-foreground mt-1"
                  onClick={() => handleCardClick(item)}
                >
                  <span>
                    {item.lastUsedAt ? `Last used ${relativeTime(item.lastUsedAt)}` : 'Never used'}
                  </span>
                  <span>{item.useCount} use{item.useCount !== 1 ? 's' : ''}</span>
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2" onClick={() => handleCardClick(item)}>
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
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-6 mb-6">
            <Library className="h-12 w-12 text-muted-foreground" />
          </div>
          {searchQuery || categoryFilter ? (
            <>
              <h3 className="text-lg font-semibold mb-1">No items match your filters</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Try adjusting your search query or changing the category filter.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearchQuery(''); setCategoryFilter(''); }}
              >
                Clear Filters
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-1">Get Started with Your Library</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Build a reusable content library for proposals. Add resumes, case studies, boilerplate text, and more.
              </p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add First Item
              </Button>
            </>
          )}
        </div>
      )}

      {/* Content preview panel */}
      {previewItem && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{previewItem.title}</h3>
              <Badge className={`text-xs px-2.5 py-0.5 ${CATEGORY_COLORS[previewItem.category] ?? 'bg-gray-100 text-gray-700'}`}>
                {previewItem.category.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyToClipboard(previewItem.content)}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy to Clipboard
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewItem(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{previewItem.content}</p>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
              <span>{wordCount(previewItem.content)} words</span>
              <span>{previewItem.content.length} characters</span>
              <span>Updated {relativeTime(previewItem.updatedAt)}</span>
              <span>{previewItem.useCount} use{previewItem.useCount !== 1 ? 's' : ''}</span>
            </div>
            {previewItem.tags && previewItem.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {previewItem.tags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
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
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[240px] resize-y"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Content..."
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {form.content.length} character{form.content.length !== 1 ? 's' : ''}
                {' / '}
                {wordCount(form.content)} word{wordCount(form.content) !== 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Comma separated tags" />
              {parsedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {parsedTags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
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
