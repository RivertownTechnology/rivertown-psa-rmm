import { useSyncExternalStore } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { TimerProvider } from '@/lib/timer';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/lib/toast';
import { ConfirmProvider } from '@/lib/confirm';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { CustomersPage } from '@/pages/customers';
import { CustomerDetailPage } from '@/pages/customer-detail';
import { AssetsPage } from '@/pages/assets';
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
import { ProductCatalogPage } from '@/pages/product-catalog';
import { Pax8Page } from '@/pages/pax8';
import { DispatchPage } from '@/pages/dispatch';
import { ReportsPage } from '@/pages/reports';
import { KnowledgeBasePage } from '@/pages/knowledge-base';
import { KBArticlePage } from '@/pages/kb-article';
import { TicketKanbanPage } from '@/pages/ticket-kanban';
import { SearchResultsPage } from '@/pages/search';
import { GovDashboardPage } from '@/pages/gov-dashboard';
import { GovOpportunitiesPage } from '@/pages/gov-opportunities';
import { GovOpportunityDetailPage } from '@/pages/gov-opportunity-detail';
import { GovLibraryPage } from '@/pages/gov-library';
import { GovAnalyticsPage } from '@/pages/gov-analytics';
import { GovSettingsPage } from '@/pages/gov-settings';
import { BusinessDocumentsPage } from '@/pages/business-documents';
import { PublicProposalPage } from '@/pages/public-proposal';
import { ComplianceDashboardPage } from '@/pages/compliance-dashboard';
import { ComplianceFrameworksPage } from '@/pages/compliance-frameworks';
import { ComplianceFrameworkDetailPage } from '@/pages/compliance-framework-detail';
import { ComplianceAssessmentsPage } from '@/pages/compliance-assessments';
import { ComplianceAssessmentDetailPage } from '@/pages/compliance-assessment-detail';
import { ComplianceRisksPage } from '@/pages/compliance-risks';
import { CompliancePoamPage } from '@/pages/compliance-poam';
import { CompliancePersonnelPage } from '@/pages/compliance-personnel';
import { ComplianceTrainingPage } from '@/pages/compliance-training';
import { ComplianceIncidentsPage } from '@/pages/compliance-incidents';
import { ComplianceEvidencePage } from '@/pages/compliance-evidence';
import { CompliancePoliciesPage } from '@/pages/compliance-policies';
import { ComplianceVendorsPage } from '@/pages/compliance-vendors';
import { ComplianceAdminPage } from '@/pages/compliance-admin';
import { ComplianceCustomersPage } from '@/pages/compliance-customers';
import { WorkflowBuilderPage } from '@/pages/workflow-builder';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { CommandPalette } from '@/components/command-palette';
import { AIChat } from '@/components/ai-chat';

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

  // Public proposal view (no auth required)
  const proposalShareMatch = pathname.match(/^\/proposal\/([a-f0-9]+)$/);
  if (proposalShareMatch) {
    return <PublicProposalPage token={proposalShareMatch[1]} />;
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
  const kbArticleMatch = pathname.match(/^\/knowledge-base\/(.+)$/);
  const govOppDetailMatch = pathname.match(/^\/gov\/opportunities\/([a-f0-9-]+)$/);
  let title = 'Dashboard';
  let currentNav = pathname;
  let content: React.ReactNode;

  if (customerMatch) {
    title = 'Customer'; currentNav = '/customers';
    content = <CustomerDetailPage customerId={customerMatch[1]} onBack={() => navigate('/customers')} />;
  } else if (pathname === '/assets') {
    title = 'Assets';
    content = <AssetsPage onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/customers') {
    title = 'Customers';
    content = <CustomersPage onSelectCustomer={navigateToCustomer} />;
  } else if (pathname === '/tickets/board') {
    title = 'Ticket Board'; currentNav = '/tickets';
    content = <TicketKanbanPage />;
  } else if (ticketMatch) {
    title = 'Ticket'; currentNav = '/tickets';
    content = <TicketDetailPage ticketId={ticketMatch[1]} onBack={() => navigate('/tickets')} onNavigateToCustomer={navigateToCustomer} onNavigate={navigate} />;
  } else if (pathname === '/tickets') {
    title = 'Tickets';
    content = <TicketsPage onSelectTicket={navigateToTicket} onNavigate={navigate} />;
  } else if (pathname === '/dispatch') {
    title = 'Dispatch';
    content = <DispatchPage />;
  } else if (pathname === '/reports') {
    title = 'Reports';
    content = <ReportsPage />;
  } else if (pathname === '/knowledge-base/new') {
    title = 'New Article'; currentNav = '/knowledge-base';
    content = <KBArticlePage onNavigate={navigate} />;
  } else if (kbArticleMatch && kbArticleMatch[1] !== 'new') {
    title = 'Article'; currentNav = '/knowledge-base';
    content = <KBArticlePage slug={kbArticleMatch[1]} onNavigate={navigate} />;
  } else if (pathname === '/knowledge-base') {
    title = 'Knowledge Base';
    content = <KnowledgeBasePage onNavigate={navigate} />;
  } else if (contractMatch) {
    title = 'Contract'; currentNav = '/billing/contracts';
    content = <ContractDetailPage contractId={contractMatch[1]} onBack={() => navigate('/billing/contracts')} onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/billing/contracts') {
    title = 'Contracts';
    content = <ContractsPage onNavigateToCustomer={navigateToCustomer} onSelectContract={navigateToContract} />;
  } else if (invoiceMatch) {
    title = 'Invoice'; currentNav = '/billing/invoices';
    content = <InvoiceDetailPage invoiceId={invoiceMatch[1]} onBack={() => navigate('/billing/invoices')} onNavigateToCustomer={navigateToCustomer} />;
  } else if (pathname === '/billing/invoices') {
    title = 'Invoices';
    content = <InvoicesPage onNavigateToCustomer={navigateToCustomer} onSelectInvoice={(id: string) => pushPath(`/billing/invoices/${id}`)} />;
  } else if (quoteMatch) {
    title = 'Quote'; currentNav = '/billing/quotes';
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
  } else if (pathname === '/settings/workflows') {
    title = 'Workflow Automation'; currentNav = '/settings';
    content = <WorkflowBuilderPage />;
  } else if (pathname === '/settings') {
    title = 'Settings';
    content = <SettingsPage />;
  } else if (pathname === '/account') {
    title = 'My Account';
    content = <AccountPage />;
  } else if (pathname === '/catalog') {
    title = 'Product Catalog'; currentNav = '/catalog';
    content = <ProductCatalogPage />;
  } else if (pathname === '/business-documents') {
    title = 'Business Documents'; currentNav = '/business-documents';
    content = <BusinessDocumentsPage />;
  } else if (govOppDetailMatch) {
    title = 'Opportunity'; currentNav = '/gov/opportunities';
    content = <GovOpportunityDetailPage opportunityId={govOppDetailMatch[1]} onBack={() => navigate('/gov/opportunities')} />;
  } else if (pathname === '/gov/opportunities') {
    title = 'Opportunities'; currentNav = '/gov/opportunities';
    content = <GovOpportunitiesPage onNavigate={navigate} />;
  } else if (pathname === '/gov/library') {
    title = 'Gov Library'; currentNav = '/gov/library';
    content = <GovLibraryPage />;
  } else if (pathname === '/gov/settings') {
    title = 'Gov Settings'; currentNav = '/gov/settings';
    content = <GovSettingsPage />;
  } else if (pathname === '/gov/analytics') {
    title = 'Gov Analytics'; currentNav = '/gov/analytics';
    content = <GovAnalyticsPage />;
  } else if (pathname === '/gov') {
    title = 'Gov Dashboard'; currentNav = '/gov';
    content = <GovDashboardPage />;
  // ── Compliance: Customer workspace routes ──
  } else if (pathname.match(/^\/compliance\/assessments\/([a-f0-9-]+)$/)) {
    const aId = pathname.match(/^\/compliance\/assessments\/([a-f0-9-]+)$/)![1];
    title = 'Assessment'; currentNav = '/compliance/customers';
    content = <ComplianceAssessmentDetailPage assessmentId={aId} onBack={() => navigate('/compliance/assessments')} />;
  } else if (pathname === '/compliance/assessments') {
    title = 'Assessments'; currentNav = '/compliance/customers';
    content = <ComplianceAssessmentsPage onNavigate={navigate} />;
  } else if (pathname === '/compliance/risks') {
    title = 'Risk Register'; currentNav = '/compliance/customers';
    content = <ComplianceRisksPage />;
  } else if (pathname === '/compliance/poam') {
    title = 'POA&M'; currentNav = '/compliance/customers';
    content = <CompliancePoamPage />;
  } else if (pathname === '/compliance/personnel') {
    title = 'Personnel'; currentNav = '/compliance/customers';
    content = <CompliancePersonnelPage />;
  } else if (pathname === '/compliance/training') {
    title = 'Training'; currentNav = '/compliance/customers';
    content = <ComplianceTrainingPage />;
  } else if (pathname === '/compliance/vendors') {
    title = 'Vendors'; currentNav = '/compliance/customers';
    content = <ComplianceVendorsPage />;
  } else if (pathname === '/compliance/evidence') {
    title = 'Evidence'; currentNav = '/compliance/customers';
    content = <ComplianceEvidencePage />;
  } else if (pathname === '/compliance/policies') {
    title = 'Policies'; currentNav = '/compliance/customers';
    content = <CompliancePoliciesPage />;
  } else if (pathname === '/compliance/incidents') {
    title = 'Incidents'; currentNav = '/compliance/customers';
    content = <ComplianceIncidentsPage />;
  } else if (pathname === '/compliance/customers') {
    title = 'Compliance Customers'; currentNav = '/compliance/customers';
    content = <ComplianceCustomersPage onNavigate={navigate} />;
  // ── Compliance: Admin routes ──
  } else if (pathname.match(/^\/compliance\/admin\/frameworks\/([a-f0-9-]+)$/)) {
    const fwId = pathname.match(/^\/compliance\/admin\/frameworks\/([a-f0-9-]+)$/)![1];
    title = 'Framework Detail'; currentNav = '/compliance/admin';
    content = <ComplianceFrameworkDetailPage frameworkId={fwId} onBack={() => navigate('/compliance/admin')} />;
  } else if (pathname === '/compliance/admin') {
    title = 'Compliance Admin'; currentNav = '/compliance/admin';
    content = <ComplianceAdminPage onNavigate={navigate} />;
  } else if (pathname === '/compliance') {
    title = 'Compliance'; currentNav = '/compliance';
    content = <ComplianceDashboardPage onNavigate={navigate} />;
  } else {
    title = 'Dashboard'; currentNav = '/';
    content = <DashboardPage />;
  }

  return (
    <>
      <CommandPalette onNavigate={navigate} />
      <DashboardLayout title={title} currentPath={currentNav} onNavigate={navigate}>
        {content}
      </DashboardLayout>
      <AIChat />
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <TimerProvider>
            <Toaster>
              <ConfirmProvider>
                <AppRouter />
              </ConfirmProvider>
            </Toaster>
          </TimerProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
