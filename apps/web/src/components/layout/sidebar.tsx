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
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
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
      { label: 'Tickets', icon: Ticket, href: '/tickets' },
      { label: 'Dispatch', icon: Calendar, href: '/dispatch' },
      { label: 'Customers', icon: Building2, href: '/customers' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { label: 'Contracts', icon: FileText, href: '/billing/contracts' },
      { label: 'Quotes', icon: FileText, href: '/billing/quotes' },
      { label: 'Invoices', icon: Receipt, href: '/billing/invoices' },
      { label: 'Time Entries', icon: Clock, href: '/billing/time-entries' },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', icon: Settings, href: '/settings' },
];

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ currentPath, onNavigate, mobileOpen, onClose }: SidebarProps) {
  return (
    <aside
      className={cn(
        'w-64 border-r bg-card flex flex-col h-screen sticky top-0 shrink-0',
        // Mobile: fixed overlay, hidden by default
        'fixed z-50 lg:static lg:translate-x-0 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Rivertown Technology" className="h-8 w-8 rounded-lg object-contain" />
          <div>
            <h1 className="text-sm font-semibold">Rivertown PSA</h1>
            <p className="text-xs text-muted-foreground">v0.1.0</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1 rounded-md hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && (
              <div className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = currentPath === item.href ||
                  (item.href !== '/' && currentPath.startsWith(item.href));
                return (
                  <button
                    key={item.href}
                    onClick={() => onNavigate(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t space-y-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href;
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
