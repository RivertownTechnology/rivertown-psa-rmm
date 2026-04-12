import type { ReactNode } from 'react';
import { Hammer, LayoutDashboard, Building2, LifeBuoy, Activity, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navigate } from '../App';

interface Item {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const NAV: Item[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, href: '/' },
  { key: 'tenants', label: 'Tenants', icon: <Building2 className="h-4 w-4" />, href: '/tenants' },
  { key: 'support', label: 'Support inbox', icon: <LifeBuoy className="h-4 w-4" />, href: '/support' },
  { key: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" />, href: '/activity' },
  { key: 'settings', label: 'System settings', icon: <Settings className="h-4 w-4" />, href: '/settings' },
];

export function Layout({ active, children }: { active: string; children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-800">
          <div className="h-8 w-8 rounded-md bg-brand-600 flex items-center justify-center">
            <Hammer className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight">ForgePSA</div>
            <div className="text-xs text-slate-500 leading-tight">Admin</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="px-3 pb-3">
            <div className="text-sm text-white font-medium truncate">{user?.displayName}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
