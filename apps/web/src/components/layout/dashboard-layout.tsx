import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function DashboardLayout({ children, title, currentPath, onNavigate }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [badgeCounts, setBadgeCounts] = useState<{ tickets?: number; invoices?: number }>({});
  const { user } = useAuth();

  function handleToggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function handleNavigate(path: string) {
    onNavigate(path);
    setSidebarOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    api<{ tickets: { open: number }; invoices: { overdue: number } }>('/dashboard/stats')
      .then((data) => {
        if (!cancelled) {
          setBadgeCounts({
            tickets: data.tickets?.open,
            invoices: data.invoices?.overdue,
          });
        }
      })
      .catch(() => {
        // silently ignore badge count fetch errors
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        currentPath={currentPath}
        onNavigate={handleNavigate}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
        badgeCounts={badgeCounts}
        user={user ? { displayName: user.displayName, email: user.email } : undefined}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={title}
          onNavigate={onNavigate}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <main className="flex-1 p-4 lg:p-page">{children}</main>
      </div>
    </div>
  );
}
