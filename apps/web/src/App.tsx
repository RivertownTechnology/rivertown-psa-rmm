import { useSyncExternalStore } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { CustomersPage } from '@/pages/customers';
import { CustomerDetailPage } from '@/pages/customer-detail';
import { TicketsPage } from '@/pages/tickets';
import { TicketDetailPage } from '@/pages/ticket-detail';
import { ContractsPage } from '@/pages/contracts';
import { ContractDetailPage } from '@/pages/contract-detail';
import { InvoicesPage } from '@/pages/invoices';
import { InvoiceDetailPage } from '@/pages/invoice-detail';
import { QuotesPage } from '@/pages/quotes';
import { TimeEntriesPage } from '@/pages/time-entries';
import { QuoteDetailPage } from '@/pages/quote-detail';
import { SettingsPage } from '@/pages/settings';
import { AccountPage } from '@/pages/account';
import { BillingPage } from '@/pages/billing';
import { AdminPage } from '@/pages/admin';
import { ProductCatalogPage } from '@/pages/product-catalog';
import { Pax8Page } from '@/pages/pax8';
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
  const { user, loading, login } = useAuth();
  const pathname = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Handle Google SSO callback — exchange code for tokens
  if (pathname === '/auth/callback') {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const API_BASE = (import.meta as any).env?.VITE_API_URL
        ? `${(import.meta as any).env.VITE_API_URL}/api/v1`
        : '/api/v1';
      fetch(`${API_BASE}/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.accessToken && data.refreshToken) {
            login(data.accessToken, data.refreshToken).then(() => {
              window.history.replaceState(null, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            });
          }
        })
        .catch(() => {
          window.history.replaceState(null, '', '/login?error=exchange_failed');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-muted-foreground">Signing in...</div>
        </div>
      );
    }
  }

  if (!user) return <LoginPage />;

  // Hard lockout: trial ended with no subscription, past-due grace expired, or cancelled.
  // Force the billing screen until a subscription is active.
  if (user.lockedOut) {
    return <BillingPage forced />;
  }

  function navigate(path: string) { pushPath(path); }
  function navigateToCustomer(id: string) { pushPath(`/customers/${id}`); }
  function navigateToContract(id: string) { pushPath(`/billing/contracts/${id}`); }
  function navigateToTicket(id: string) { pushPath(`/tickets/${id}`); }

  const customerMatch = pathname.match(/^\/customers\/([a-f0-9-]+)$/);
  const contractMatch = pathname.match(/^\/billing\/contracts\/([a-f0-9-]+)$/);
  const ticketMatch = pathname.match(/^\/tickets\/([a-f0-9-]+)$/);
  const invoiceMatch = pathname.match(/^\/billing\/invoices\/([a-f0-9-]+)$/);
  const quoteMatch = pathname.match(/^\/billing\/quotes\/([a-f0-9-]+)$/);
  let title = 'Dashboard';
  let currentNav = pathname;
  let content: React.ReactNode;

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
    // Google email OAuth callback — catches the redirect from Google login
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="email" />;
  } else if (pathname === '/settings/calendar/callback') {
    // Google Calendar OAuth callback
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="general" />;
  } else if (pathname === '/settings/security') {
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="security" />;
  } else if (pathname === '/settings/catalog') {
    title = 'Settings'; currentNav = '/settings';
    content = <SettingsPage initialTab="catalog" />;
  } else if (pathname === '/pax8') {
    title = 'Pax8'; currentNav = '/pax8';
    content = <Pax8Page onBack={() => navigate('/settings')} />;
  } else if (pathname === '/settings') {
    title = 'Settings';
    content = <SettingsPage />;
  } else if (pathname === '/account') {
    title = 'My Account';
    content = <AccountPage />;
  } else if (pathname === '/billing') {
    title = 'Billing';
    content = <BillingPage />;
  } else if (pathname === '/admin') {
    title = 'ForgePSA Admin';
    content = <AdminPage />;
  } else if (pathname === '/catalog') {
    title = 'Product Catalog'; currentNav = '/catalog';
    content = <ProductCatalogPage />;
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
