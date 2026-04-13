import { useState, useEffect } from 'react';
import { Landing } from './pages/Landing';
import { Pricing } from './pages/Pricing';
import { Features } from './pages/Features';
import { Signup } from './pages/Signup';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { FAQ } from './pages/FAQ';
import { Support } from './pages/Support';
import { Compare } from './pages/Compare';
import { Philosophy } from './pages/Philosophy';
import { Blog } from './pages/Blog';
import { Changelog } from './pages/Changelog';
import { Demo } from './pages/Demo';
import { MigrationChecklist } from './pages/MigrationChecklist';
import { MarketingHeader } from './components/MarketingHeader';
import { MarketingFooter } from './components/MarketingFooter';
import { CookieConsent } from './components/CookieConsent';
import { ThemeProvider } from './lib/theme';

export function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setPathname(path);
    window.scrollTo(0, 0);
  }

  const content = resolveRoute(pathname, navigate);
  if (content === null) return null; // external redirect

  // Signup has its own full-page layout
  if (pathname === '/signup') {
    return <>{content}<CookieConsent /></>;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <MarketingHeader pathname={pathname} navigate={navigate} />
      <main className="flex-1">{content}</main>
      <MarketingFooter navigate={navigate} />
      <CookieConsent />
    </div>
  );
}

function resolveRoute(pathname: string, navigate: (p: string) => void): React.ReactNode | null {
  if (pathname === '/signup') return <Signup navigate={navigate} />;
  if (pathname === '/pricing') return <Pricing navigate={navigate} />;
  if (pathname === '/features') return <Features navigate={navigate} />;
  if (pathname === '/faq') return <FAQ navigate={navigate} />;
  if (pathname === '/support') return <Support navigate={navigate} />;
  if (pathname === '/terms') return <Terms navigate={navigate} />;
  if (pathname === '/privacy') return <Privacy navigate={navigate} />;
  if (pathname === '/philosophy') return <Philosophy navigate={navigate} />;
  if (pathname === '/changelog') return <Changelog navigate={navigate} />;
  if (pathname === '/demo') return <Demo navigate={navigate} />;
  if (pathname === '/guides/migration-checklist') return <MigrationChecklist navigate={navigate} />;

  if (pathname === '/compare') return <Compare navigate={navigate} />;
  if (pathname.startsWith('/compare/')) {
    const slug = pathname.slice('/compare/'.length);
    return <Compare navigate={navigate} slug={slug} />;
  }

  if (pathname === '/blog') return <Blog navigate={navigate} />;
  if (pathname.startsWith('/blog/')) {
    const slug = pathname.slice('/blog/'.length);
    return <Blog navigate={navigate} slug={slug} />;
  }

  if (pathname === '/login') {
    window.location.href = 'https://app.forgepsa.com/login';
    return null;
  }

  return <Landing navigate={navigate} />;
}
