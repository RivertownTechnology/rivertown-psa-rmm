import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Headset,
  LogOut,
  Ticket,
  FileText,
  Receipt,
  Monitor,
  Plus,
  User,
} from 'lucide-react';

type TabId = 'tickets' | 'quotes' | 'invoices' | 'assets';

interface DashboardProps {
  userName: string;
  onLogout: () => void;
}

const tabs: { id: TabId; label: string; icon: typeof Ticket }[] = [
  { id: 'tickets', label: 'My Tickets', icon: Ticket },
  { id: 'quotes', label: 'My Quotes', icon: FileText },
  { id: 'invoices', label: 'My Invoices', icon: Receipt },
  { id: 'assets', label: 'My Assets', icon: Monitor },
];

export function Dashboard({ userName, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('tickets');

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Headset className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold">Support Portal</span>
          </div>
          <div className="flex items-center gap-3">
            {userName && (
              <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                <User className="h-3.5 w-3.5" />
                {userName}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Welcome section */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </h1>
          <p className="text-muted-foreground">
            View and manage your support requests, quotes, invoices, and assets.
          </p>
        </div>

        {/* Quick stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <QuickStat label="Open Tickets" value="--" />
          <QuickStat label="Pending Quotes" value="--" />
          <QuickStat label="Unpaid Invoices" value="--" />
          <QuickStat label="Managed Assets" value="--" />
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <TabContent activeTab={activeTab} />
      </main>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function TabContent({ activeTab }: { activeTab: TabId }) {
  switch (activeTab) {
    case 'tickets':
      return <TicketsTab />;
    case 'quotes':
      return <QuotesTab />;
    case 'invoices':
      return <InvoicesTab />;
    case 'assets':
      return <AssetsTab />;
  }
}

function TicketsTab() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Tickets</CardTitle>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="When you submit a support request, it will appear here. You can track status, add comments, and view responses from your IT team."
        />
      </CardContent>
    </Card>
  );
}

function QuotesTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Quotes</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={FileText}
          title="No quotes"
          description="Quotes for proposed work and hardware will appear here. You can review line items and approve or decline each quote."
        />
      </CardContent>
    </Card>
  );
}

function InvoicesTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={Receipt}
          title="No invoices"
          description="Your invoices will appear here. You can view details, download PDFs, and see payment status."
        />
      </CardContent>
    </Card>
  );
}

function AssetsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Assets</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={Monitor}
          title="No assets"
          description="Devices and hardware managed on your behalf will be listed here, including warranty information and service history."
        />
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ticket;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
