import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Ticket, Calendar, Building2, FileText, Receipt, Clock,
  Settings, Package, X, ChevronLeft, ChevronRight, ChevronDown,
  BarChart3, BookOpen, Landmark, Target, Archive, FolderOpen, Monitor,
  ShieldCheck, ClipboardCheck, Library, AlertTriangle, ListChecks,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  badgeKey?: 'tickets' | 'invoices';
}

interface NavGroup {
  label: string;
  icon?: typeof LayoutDashboard;
  items: NavItem[];
  defaultHref?: string; // clicking parent goes here
}

// ── Navigation Structure ───────────────────────────────────────────

const coreItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'Tickets', icon: Ticket, href: '/tickets', badgeKey: 'tickets' },
  { label: 'Dispatch', icon: Calendar, href: '/dispatch' },
  { label: 'Customers', icon: Building2, href: '/customers' },
  { label: 'Assets', icon: Monitor, href: '/assets' },
];

const navGroups: NavGroup[] = [
  {
    label: 'Operations',
    icon: BarChart3,
    items: [
      { label: 'Reports', icon: BarChart3, href: '/reports' },
      { label: 'Business Docs', icon: FolderOpen, href: '/business-documents' },
      { label: 'Knowledge Base', icon: BookOpen, href: '/knowledge-base' },
    ],
  },
  {
    label: 'Billing',
    icon: Receipt,
    items: [
      { label: 'Contracts', icon: FileText, href: '/billing/contracts' },
      { label: 'Quotes', icon: FileText, href: '/billing/quotes' },
      { label: 'Invoices', icon: Receipt, href: '/billing/invoices', badgeKey: 'invoices' },
      { label: 'Time Entries', icon: Clock, href: '/billing/time-entries' },
    ],
  },
  {
    label: 'Gov Contracts',
    icon: Landmark,
    defaultHref: '/gov',
    items: [
      { label: 'Opportunities', icon: Target, href: '/gov/opportunities' },
      { label: 'Library', icon: Archive, href: '/gov/library' },
      { label: 'Analytics', icon: BarChart3, href: '/gov/analytics' },
      { label: 'Settings', icon: Settings, href: '/gov/settings' },
    ],
  },
  {
    label: 'Compliance',
    icon: ShieldCheck,
    defaultHref: '/compliance',
    items: [
      { label: 'Customers', icon: Building2, href: '/compliance/customers' },
      { label: 'Admin', icon: Settings, href: '/compliance/admin' },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Product Catalog', icon: Package, href: '/catalog' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

// ── Component ──────────────────────────────────────────────────────

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  badgeCounts?: { tickets?: number; invoices?: number };
  user?: { displayName: string; email: string };
}

export function Sidebar({
  currentPath,
  onNavigate,
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapse,
  badgeCounts,
  user,
}: SidebarProps) {
  const getInitialExpanded = () => {
    const active: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      const hasActive = group.items.some(item =>
        currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href + '/'))
      ) || (group.defaultHref && (currentPath === group.defaultHref || currentPath.startsWith(group.defaultHref + '/')));
      active[group.label] = hasActive;
    });
    return active;
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(getInitialExpanded);

  function toggleGroup(label: string) {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(href: string, allItems?: NavItem[]) {
    const exactMatch = currentPath === href;
    const prefixMatch = href !== '/' && currentPath.startsWith(href + '/');
    if (!allItems) return exactMatch || prefixMatch;
    const hasBetterMatch = prefixMatch && allItems.some(
      other => other.href !== href && other.href.length > href.length && (currentPath === other.href || currentPath.startsWith(other.href + '/'))
    );
    return exactMatch || (prefixMatch && !hasBetterMatch);
  }

  const initials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??';

  // ── Render helpers ─────────────────────────────────────────────

  function renderNavItem(item: NavItem, indent = false, allItems?: NavItem[]) {
    const Icon = item.icon;
    const active = isActive(item.href, allItems);
    const badgeCount = item.badgeKey ? badgeCounts?.[item.badgeKey] : undefined;

    return (
      <button
        key={item.href}
        onClick={() => onNavigate(item.href)}
        title={collapsed ? item.label : undefined}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-md text-[13px] transition-all text-left relative',
          collapsed ? 'justify-center px-2 py-2' : indent ? 'pl-9 pr-3 py-1.5' : 'px-3 py-2',
          active
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        )}
      >
        <Icon className={cn('shrink-0', indent ? 'h-3.5 w-3.5' : 'h-4 w-4', active && 'text-primary')} />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {badgeCount != null && badgeCount > 0 && (
          <span className={cn(
            'bg-primary text-primary-foreground text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium',
            collapsed && 'absolute -top-1 -right-1',
          )}>
            {badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0 shrink-0 border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-[52px]' : 'w-60',
        'fixed z-50 lg:static lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Header */}
      <div className="px-3 py-3 border-b border-sidebar-border flex items-center justify-between min-h-[52px]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <img src="/logo.png" alt="Rivertown" className="h-7 w-7 rounded-md object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-[13px] font-semibold text-white leading-tight">Rivertown PSA</h1>
              <p className="text-[10px] text-sidebar-muted leading-tight">v{__APP_VERSION__}</p>
            </div>
          )}
        </div>
        <div className="flex items-center shrink-0">
          <button onClick={onToggleCollapse} className="hidden lg:flex items-center justify-center h-6 w-6 rounded hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground transition-colors" aria-label="Toggle sidebar">
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {/* Core items — always visible */}
        <div className="space-y-0.5">
          {coreItems.map(item => renderNavItem(item, false, coreItems))}
        </div>

        {/* Grouped sections */}
        {navGroups.map((group) => {
          const isExpanded = expandedGroups[group.label] !== false;
          const hasActive = group.items.some(item => isActive(item.href))
            || (group.defaultHref && isActive(group.defaultHref));
          const GroupIcon = group.icon;

          return (
            <div key={group.label} className="mt-4">
              {/* Section divider */}
              {!collapsed && <div className="mx-2 mb-2 border-t border-sidebar-border/50" />}
              {collapsed && <div className="mx-1 mb-2 border-t border-sidebar-border/50" />}

              {/* Group header */}
              {!collapsed ? (
                <button
                  onClick={() => {
                    if (group.defaultHref && !isExpanded) {
                      onNavigate(group.defaultHref);
                    }
                    toggleGroup(group.label);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors',
                    hasActive ? 'text-primary' : 'text-sidebar-muted hover:text-sidebar-foreground',
                  )}
                >
                  {GroupIcon && <GroupIcon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', !isExpanded && '-rotate-90')} />
                </button>
              ) : (
                // Collapsed: show group icon as button
                group.defaultHref && (
                  <button
                    onClick={() => onNavigate(group.defaultHref!)}
                    title={group.label}
                    className={cn(
                      'w-full flex justify-center py-2 rounded-md transition-colors',
                      hasActive ? 'text-primary bg-primary/10' : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                    )}
                  >
                    {GroupIcon && <GroupIcon className="h-4 w-4" />}
                  </button>
                )
              )}

              {/* Group children */}
              {(isExpanded || collapsed) && !collapsed && (
                <div className="mt-1 space-y-0.5">
                  {/* If group has defaultHref, show it as "Overview" */}
                  {group.defaultHref && (
                    <button
                      onClick={() => onNavigate(group.defaultHref!)}
                      className={cn(
                        'w-full flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-[13px] transition-all text-left',
                        isActive(group.defaultHref) && !group.items.some(i => isActive(i.href))
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                      )}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                      <span>Overview</span>
                    </button>
                  )}
                  {group.items.map(item => renderNavItem(item, true, group.items))}
                </div>
              )}

              {/* Collapsed: show child items as icon buttons */}
              {collapsed && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(item => renderNavItem(item, false, group.items))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User info */}
      {user && (
        <div className={cn(
          'px-2 py-2 border-t border-sidebar-border flex items-center gap-2.5 overflow-hidden',
          collapsed && 'justify-center',
        )}>
          <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-white truncate">{user.displayName}</div>
              <div className="text-[10px] text-sidebar-muted truncate">{user.email}</div>
            </div>
          )}
        </div>
      )}

      {/* Bottom nav */}
      <div className="px-2 py-2 border-t border-sidebar-border space-y-0.5">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href || currentPath.startsWith(item.href + '/');
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center gap-2.5 py-1.5 rounded-md text-[13px] transition-all text-left',
                collapsed ? 'justify-center px-2' : 'px-3',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
              {!collapsed && item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
