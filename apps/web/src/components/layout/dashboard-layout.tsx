import { useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { TrialBanner } from './trial-banner';
import { OnboardingBanner } from './onboarding-banner';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function DashboardLayout({ children, title, currentPath, onNavigate }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleNavigate(path: string) {
    onNavigate(path);
    setSidebarOpen(false);
  }

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
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TrialBanner onNavigate={onNavigate} />
        <OnboardingBanner onNavigate={onNavigate} />
        <Header
          title={title}
          onNavigate={onNavigate}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <main className="flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
