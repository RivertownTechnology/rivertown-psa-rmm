import { useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ArrowLeft, Pencil, Save, X, Eye } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  category: string | null;
  visibility: string;
  status: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

const VISIBILITY_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'portal', label: 'Portal' },
  { value: 'public', label: 'Public' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KBArticlePage({ slug, onNavigate }: { slug?: string; onNavigate?: (path: string) => void }) {
  const isNew = !slug;

  const [article, setArticle] = useState<KBArticle | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const [status, setStatus] = useState('draft');

  // Load article
  const loadArticle = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const data = await api<KBArticle>(`/knowledge-base/${slug}`);
      setArticle(data);
      setTitle(data.title);
      setBody(data.body || '');
      setCategory(data.category ?? '');
      setVisibility(data.visibility);
      setStatus(data.status);
    } catch {
      // article not found
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadArticle();
    api<string[]>('/knowledge-base/categories')
      .then(c => { if (Array.isArray(c)) setCategories(c); })
      .catch(() => {});
  }, [loadArticle]);

  // Save / Create
  async function handleSave() {
    setSaving(true);
    try {
      const payload = { title, body, category: category || null, visibility, status };
      if (isNew) {
        const created = await api<KBArticle>('/knowledge-base', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNavigate?.(`/knowledge-base/${created.slug || created.id}`);
      } else {
        const updated = await api<KBArticle>(`/knowledge-base/${slug}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setArticle(updated);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isNew) {
      onNavigate?.('/knowledge-base');
      return;
    }
    if (article) {
      setTitle(article.title);
      setBody(article.body || '');
      setCategory(article.category ?? '');
      setVisibility(article.visibility);
      setStatus(article.status);
    }
    setEditing(false);
  }

  const categoryOptions = [
    { value: '', label: 'No category' },
    ...categories.map(c => ({ value: c, label: c })),
  ];

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[
        { label: 'Knowledge Base', href: '/knowledge-base' },
        { label: isNew ? 'New Article' : (article?.title ?? 'Article') },
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => onNavigate?.('/knowledge-base')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        {!editing && article && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        /* ============================================================== */
        /* Edit / Create Mode                                              */
        /* ============================================================== */
        <Card>
          <CardHeader>
            <CardTitle>{isNew ? 'New Article' : 'Edit Article'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Article title..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Combobox
                  options={categoryOptions}
                  value={category}
                  onValueChange={setCategory}
                  placeholder="Select category..."
                />
              </div>
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Combobox
                  options={VISIBILITY_OPTIONS}
                  value={visibility}
                  onValueChange={setVisibility}
                  placeholder="Select visibility..."
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Combobox
                  options={STATUS_OPTIONS}
                  value={status}
                  onValueChange={setStatus}
                  placeholder="Select status..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-body">Body (Markdown)</Label>
              <textarea
                id="kb-body"
                rows={20}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your article content here..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving || !title.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? 'Saving...' : isNew ? 'Create Article' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : article ? (
        /* ============================================================== */
        /* View Mode                                                       */
        /* ============================================================== */
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              {article.category && (
                <Badge variant="secondary">{article.category}</Badge>
              )}
              <Badge variant="secondary" className={article.visibility === 'public' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : article.visibility === 'portal' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}>
                {article.visibility}
              </Badge>
              <Badge variant="secondary" className={article.status === 'published' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-500/10 text-gray-600 dark:text-gray-400'}>
                {article.status}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <Eye className="h-3 w-3" />{article.viewCount ?? 0} views
              </span>
            </div>
            <CardTitle className="text-xl mt-2">{article.title}</CardTitle>
            <div className="text-xs text-muted-foreground">
              Last updated {new Date(article.updatedAt || article.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.body || '<em>No content</em>') }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="text-center text-muted-foreground py-12">Article not found.</div>
      )}
    </div>
  );
}
