import { useEffect, useState, useSyncExternalStore } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { TenantsPage } from './pages/Tenants';
import { TenantDetailPage } from './pages/TenantDetail';
import { SupportInboxPage } from './pages/SupportInbox';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { Layout } from './components/Layout';

function useLocation() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('popstate', cb);
      return () => window.removeEventListener('popstate', cb);
    },
    () => window.location.pathname,
  );
}

export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Router() {
  const { user, loading } = useAuth();
  const pathname = useLocation();
  const [impersonationHandled, setImpersonationHandled] = useState(false);

  // If the admin triggered impersonation from here, we redirect away to app.forgepsa.com
  // in a separate code path — nothing to do here.
  useEffect(() => { setImpersonationHandled(true); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (!impersonationHandled) return null;

  const tenantDetailMatch = pathname.match(/^\/tenants\/([a-f0-9-]+)$/);

  let content: React.ReactNode;
  let active = 'dashboard';

  if (tenantDetailMatch) {
    content = <TenantDetailPage tenantId={tenantDetailMatch[1]} />;
    active = 'tenants';
  } else if (pathname === '/tenants') {
    content = <TenantsPage />;
    active = 'tenants';
  } else if (pathname === '/support') {
    content = <SupportInboxPage />;
    active = 'support';
  } else if (pathname === '/activity') {
    content = <ActivityPage />;
    active = 'activity';
  } else if (pathname === '/settings') {
    content = <SettingsPage />;
    active = 'settings';
  } else {
    content = <DashboardPage />;
    active = 'dashboard';
  }

  return <Layout active={active}>{content}</Layout>;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
