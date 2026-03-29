import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function DashboardLayout({ children, title, currentPath, onNavigate }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar currentPath={currentPath} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col">
        <Header title={title} onNavigate={onNavigate} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
