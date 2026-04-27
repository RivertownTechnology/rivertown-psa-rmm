import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Ticket,
  Calendar,
  Building2,
  FileText,
  Receipt,
  Clock,
  Settings,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  BookOpen,
  Landmark,
  Target,
  Archive,
  FolderOpen,
  Monitor,
  ShieldCheck,
  ClipboardCheck,
  Library,
  AlertTriangle,
  ListChecks,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  badgeKey?: 'tickets' | 'invoices';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
      { label: 'Tickets', icon: Ticket, href: '/tickets', badgeKey: 'tickets' },
      { label: 'Dispatch', icon: Calendar, href: '/dispatch' },
      { label: 'Reports', icon: BarChart3, href: '/reports' },
      { label: 'Customers', icon: Building2, href: '/customers' },
      { label: 'Assets', icon: Monitor, href: '/assets' },
      { label: 'Business Docs', icon: FolderOpen, href: '/business-documents' },
      { label: 'Knowledge Base', icon: BookOpen, href: '/knowledge-base' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { label: 'Contracts', icon: FileText, href: '/billing/contracts' },
      { label: 'Quotes', icon: FileText, href: '/billing/quotes' },
      { label: 'Invoices', icon: Receipt, href: '/billing/invoices', badgeKey: 'invoices' },
      { label: 'Time Entries', icon: Clock, href: '/billing/time-entries' },
    ],
  },
  {
    label: 'Gov Contracts',
    items: [
      { label: 'Dashboard', icon: Landmark, href: '/gov' },
      { label: 'Opportunities', icon: Target, href: '/gov/opportunities' },
      { label: 'Library', icon: Archive, href: '/gov/library' },
      { label: 'Analytics', icon: BarChart3, href: '/gov/analytics' },
      { label: 'Settings', icon: Settings, href: '/gov/settings' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Dashboard', icon: ShieldCheck, href: '/compliance' },
      { label: 'Customers', icon: Building2, href: '/compliance/customers' },
      { label: 'Admin', icon: Settings, href: '/compliance/admin' },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Product Catalog', icon: Package, href: '/catalog' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

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
  // Auto-expand groups that contain the active page
  const getActiveGroups = () => {
    const active: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      if (!group.label) return; // unlabeled group always open
      const hasActive = group.items.some(item =>
        currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href + '/'))
      );
      active[group.label] = hasActive;
    });
    return active;
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(getActiveGroups);

  function toggleGroup(label: string) {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  const initials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??';

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0 shrink-0 border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
        // Mobile: fixed overlay, hidden by default
        'fixed z-50 lg:static lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Header / Logo */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between min-h-[57px]">
        <div className="flex items-center gap-3 overflow-hidden">
          <img
            src="/logo.png"
            alt="Rivertown Technology"
            className="h-8 w-8 rounded-lg object-contain shrink-0"
          />
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold text-white">Rivertown PSA</h1>
              <p className="text-xs text-sidebar-muted">v{__APP_VERSION__}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center h-6 w-6 rounded-md hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navGroups.map((group, gi) => {
          const isExpanded = !group.label || expandedGroups[group.label] !== false;
          const hasActiveItem = group.items.some(item =>
            currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href + '/'))
          );

          return (
          <div key={gi} className={gi > 0 ? 'mt-2' : ''}>
            {group.label && !collapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 mb-1 text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:text-sidebar-foreground transition-colors"
              >
                <span className={hasActiveItem ? 'text-primary' : ''}>{group.label}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', !isExpanded && '-rotate-90')} />
              </button>
            )}
            {group.label && collapsed && <div className="my-2 mx-2 border-t border-sidebar-border" />}
            {(isExpanded || collapsed) && <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                // Exact match, or prefix match only if no other nav item is a longer match
                const exactMatch = currentPath === item.href;
                const prefixMatch = item.href !== '/' && currentPath.startsWith(item.href + '/');
                const hasBetterMatch = prefixMatch && group.items.some(
                  other => other.href !== item.href && other.href.length > item.href.length && (currentPath === other.href || currentPath.startsWith(other.href + '/'))
                );
                const active = exactMatch || (prefixMatch && !hasBetterMatch);
                const badgeCount = item.badgeKey ? badgeCounts?.[item.badgeKey] : undefined;

                return (
                  <button
                    key={item.href}
                    onClick={() => onNavigate(item.href)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 py-2 rounded-md text-sm transition-colors text-left relative',
                      collapsed ? 'justify-center px-2' : 'px-3',
                      active
                        ? 'border-l-2 border-primary bg-sidebar-accent text-white'
                        : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent border-l-2 border-transparent',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1">{item.label}</span>}
                    {badgeCount != null && badgeCount > 0 && (
                      <span
                        className={cn(
                          'bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5',
                          collapsed && 'absolute -top-1 -right-1 min-w-[18px] h-[18px] text-[10px]',
                        )}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>}
          </div>
          );
        })}
      </nav>

      {/* User info */}
      {user && (
        <div
          className={cn(
            'px-3 py-3 border-t border-sidebar-border flex items-center gap-3 overflow-hidden',
            collapsed && 'justify-center px-2',
          )}
        >
          <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.displayName}</div>
              <div className="text-xs text-sidebar-muted truncate">{user.email}</div>
            </div>
          )}
        </div>
      )}

      {/* Bottom nav (Settings) */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href;
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center gap-3 py-2 rounded-md text-sm transition-colors text-left',
                collapsed ? 'justify-center px-2' : 'px-3',
                active
                  ? 'border-l-2 border-primary bg-sidebar-accent text-white'
                  : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent border-l-2 border-transparent',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
