import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Plus, BookOpen, Eye } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  visibility: string; // internal | portal | public
  status: string; // draft | published
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const visibilityBadge: Record<string, string> = {
  internal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  portal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  public: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

const statusBadge: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeBasePage({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await api<{ data: KBArticle[] } | KBArticle[]>(`/knowledge-base?${params}`);
      const list = Array.isArray(res) ? res : res.data ?? [];
      setArticles(list);
      // Extract unique categories
      const cats = [...new Set(list.map(a => a.category).filter(Boolean) as string[])];
      if (cats.length > 0 && categories.length === 0) setCategories(cats);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryFilter]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Fetch categories once
  useEffect(() => {
    api<string[]>('/knowledge-base/categories')
      .then(c => { if (Array.isArray(c) && c.length > 0) setCategories(c); })
      .catch(() => {});
  }, []);

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(c => ({ value: c, label: c })),
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Combobox
            options={categoryOptions}
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            placeholder="Category..."
            className="w-44"
          />
        </div>
        <Button onClick={() => onNavigate?.('/knowledge-base/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Article
        </Button>
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {articles.length} article{articles.length !== 1 ? 's' : ''}
      </div>

      {/* Articles list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No articles found"
          description={debouncedSearch || categoryFilter ? 'Try adjusting your search or filters.' : 'Create your first knowledge base article.'}
          action={!debouncedSearch && !categoryFilter ? { label: 'New Article', onClick: () => onNavigate?.('/knowledge-base/new') } : undefined}
        />
      ) : (
        <div className="space-y-1">
          {articles.map(article => (
            <div
              key={article.id}
              onClick={() => onNavigate?.(`/knowledge-base/${article.slug || article.id}`)}
              className="rounded-lg border bg-card px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-sm truncate">{article.title}</h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {relativeDate(article.updatedAt || article.createdAt)}
                </span>
              </div>
              {article.excerpt && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.excerpt}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {article.category && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-4 border-0">
                    {article.category}
                  </Badge>
                )}
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 leading-4 border-0 ${visibilityBadge[article.visibility] ?? ''}`}>
                  {article.visibility}
                </Badge>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 leading-4 border-0 ${statusBadge[article.status] ?? ''}`}>
                  {article.status}
                </Badge>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Eye className="h-3 w-3" />{article.viewCount ?? 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
