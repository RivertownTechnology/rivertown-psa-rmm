import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { api } from '@/lib/api';
import {
  Ticket, Building2, FileText, Receipt, Clock, Settings,
  LayoutDashboard, Calendar, Package, Search,
} from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'ticket' | 'customer' | 'contract' | 'invoice';
  label: string;
  sublabel?: string;
}

interface CommandPaletteProps {
  onNavigate: (path: string) => void;
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Listen for Cmd+K and custom event
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('open-command-palette', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('open-command-palette', onCustomOpen);
    };
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search, doSearch]);

  function handleSelect(value: string) {
    setOpen(false);
    setSearch('');
    onNavigate(value);
  }

  const pages = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Tickets', href: '/tickets', icon: Ticket },
    { label: 'Dispatch', href: '/dispatch', icon: Calendar },
    { label: 'Customers', href: '/customers', icon: Building2 },
    { label: 'Contracts', href: '/billing/contracts', icon: FileText },
    { label: 'Invoices', href: '/billing/invoices', icon: Receipt },
    { label: 'Time Entries', href: '/billing/time-entries', icon: Clock },
    { label: 'Product Catalog', href: '/catalog', icon: Package },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  const resultIcon = {
    ticket: Ticket,
    customer: Building2,
    contract: FileText,
    invoice: Receipt,
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-lg border bg-popover text-popover-foreground shadow-2xl"
          shouldFilter={false}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search tickets, customers, contracts..."
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            {loading && (
              <Command.Loading>
                <div className="py-4 text-center text-sm text-muted-foreground">Searching...</div>
              </Command.Loading>
            )}
            <Command.Empty className="py-4 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Search results */}
            {results.length > 0 && (
              <Command.Group heading="Results">
                {results.map((r) => {
                  const Icon = resultIcon[r.type] ?? Ticket;
                  const href = r.type === 'ticket' ? `/tickets/${r.id}`
                    : r.type === 'customer' ? `/customers/${r.id}`
                    : r.type === 'contract' ? `/billing/contracts/${r.id}`
                    : `/billing/invoices/${r.id}`;
                  return (
                    <Command.Item
                      key={`${r.type}-${r.id}`}
                      value={`${r.type}-${r.id}`}
                      onSelect={() => handleSelect(href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate">{r.label}</div>
                        {r.sublabel && (
                          <div className="text-xs text-muted-foreground truncate">{r.sublabel}</div>
                        )}
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Navigation */}
            {!search && (
              <Command.Group heading="Navigation">
                {pages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <Command.Item
                      key={p.href}
                      value={p.label}
                      onSelect={() => handleSelect(p.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {p.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
