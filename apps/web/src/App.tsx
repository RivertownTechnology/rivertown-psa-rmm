import { useSyncExternalStore } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { CustomersPage } from '@/pages/customers';
import { CustomerDetailPage } from '@/pages/customer-detail';
import { TicketsPage } from '@/pages/tickets';
import { TicketDetailPage } from '@/pages/ticket-detail';
import { RmmPage } from '@/pages/rmm';
import { RmmDeviceDetailPage } from '@/pages/rmm-device-detail';
import { ContractsPage } from '@/pages/contracts';
import { ContractDetailPage } from '@/pages/contract-detail';
import { InvoicesPage } from '@/pages/invoices';
import { InvoiceDetailPage } from '@/pages/invoice-detail';
import { QuotesPage } from '@/pages/quotes';
import { TimeEntriesPage } from '@/pages/time-entries';
import { QuoteDetailPage } from '@/pages/quote-detail';
import { SettingsPage } from '@/pages/settings';
import { DispatchPage } from '@/pages/dispatch';
import { SearchResultsPage } from '@/pages/search';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

function useLocation() {
  const getPath = () => window.location.pathname;
  const subscribe = (cb: () => void) => {
    window.addEventListener('popstate', cb);
    return () => window.removeEventListener('popstate', cb);
  };
  return useSyncExternalStore(subscribe, getPath);
}

function pushPath(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

function AppRouter() {
  const { user, loading } = useAuth();
  const pathname = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  function navigate(path: string) { pushPath(path); }
  function navigateToCustomer(id: string) { pushPath(`/customers/${id}`); }
  function navigateToContract(id: string) { pushPath(`/billing/contracts/${id}`); }
  function navigateToTicket(id: string) { pushPath(`/tickets/${id}`); }

  const customerMatch = pathname.match(/^\/customers\/([a-f0-9-]+)$/);
  const contractMatch = pathname.match(/^\/billing\/contracts\/([a-f0-9-]+)$/);
  const ticketMatch = pathname.match(/^\/tickets\/([a-f0-9-]+)$/);
  const invoiceMatch = pathname.match(/^\/billing\/invoices\/([a-f0-9-]+)$/);
  const quoteMatch = pathname.match(/^\/billing\/quotes\/([a-f0-9-]+)$/);
  const rmmDeviceMatch = pathname.match(/^\/rmm\/devices\/([a-f0-9-]+)$/);

  let title = 'Dashboard';
  let currentNav = pathname;
  let content: JSX.Element;

  if (customerMatch) {
    title = 'Customer'; currentNav = '/customers';
    content = <CustomerDetailPage customerId={customerMatch[1]} onBack={() => navigate('/customers')} />;
  } else if (pathname === '/customers') {
    title = 'Customers';
    content = <CustomersPage onSelectCustomer={navigateToCustomer} />;
  } else if (ticketMatch) {
    title = 'Ticket'; currentNav = '/tickets';
    content = <TicketDetailPage ticketId={ticketMatch[1]} onBack={() => navigate('/tickets')} onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/tickets') {
    title = 'Tickets';
    content = <TicketsPage onSelectTicket={navigateToTicket} />;
  } else if (pathname === '/dispatch') {
    title = 'Dispatch';
    content = <DispatchPage />;
  } else if (rmmDeviceMatch) {
    title = 'Device'; currentNav = '/rmm';
    content = <RmmDeviceDetailPage deviceId={rmmDeviceMatch[1]} onBack={() => navigate('/rmm')} />;
  } else if (pathname === '/rmm') {
    title = 'RMM - Devices';
    content = <RmmPage onNavigateToCustomer={navigateToCustomer} />;
  } else if (contractMatch) {
    title = 'Contract Detail'; currentNav = '/billing/contracts';
    content = <ContractDetailPage contractId={contractMatch[1]} onBack={() => navigate('/billing/contracts')} onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/billing/contracts') {
    title = 'Contracts';
    content = <ContractsPage onNavigateToCustomer={navigateToCustomer} onSelectContract={navigateToContract} />;
  } else if (invoiceMatch) {
    title = 'Invoice Detail'; currentNav = '/billing/invoices';
    content = <InvoiceDetailPage invoiceId={invoiceMatch[1]} onBack={() => navigate('/billing/invoices')} onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/billing/invoices') {
    title = 'Invoices';
    content = <InvoicesPage onNavigateToCustomer={navigateToCustomer} onSelectInvoice={(id: string) => pushPath(`/billing/invoices/${id}`)} />;
  } else if (quoteMatch) {
    title = 'Quote Detail'; currentNav = '/billing/quotes';
    content = <QuoteDetailPage quoteId={quoteMatch[1]} onBack={() => navigate('/billing/quotes')} onNavigateToCustomer={navigateToCustomer} onNavigateToContract={navigateToContract} />;
  } else if (pathname === '/billing/quotes') {
    title = 'Quotes';
    content = <QuotesPage onNavigateToCustomer={navigateToCustomer} onSelectQuote={(id: string) => pushPath(`/billing/quotes/${id}`)} />;
  } else if (pathname === '/billing/time-entries') {
    title = 'Time Entries';
    content = <TimeEntriesPage />;
  } else if (pathname.startsWith('/search')) {
    title = 'Search';
    const q = new URLSearchParams(window.location.search).get('q') ?? '';
    content = <SearchResultsPage query={q} onNavigateToCustomer={navigateToCustomer} onNavigateToTicket={navigateToTicket} />;
  } else if (pathname === '/settings/email/callback') {
    // Microsoft 365 OAuth callback — catches the redirect from Microsoft login
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="email" />;
  } else if (pathname === '/settings/rmm') {
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="rmm" />;
  } else if (pathname === '/settings/security') {
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="security" />;
  } else if (pathname === '/settings/catalog') {
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="catalog" />;
  } else if (pathname === '/settings') {
    title = 'Settings';
    content = <SettingsPage />;
  } else {
    title = 'Dashboard'; currentNav = '/';
    content = <DashboardPage />;
  }

  return (
    <DashboardLayout title={title} currentPath={currentNav} onNavigate={navigate}>
      {content}
    </DashboardLayout>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
