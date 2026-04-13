import { useState, useEffect } from 'react';
import { Landing } from './pages/Landing';
import { Pricing } from './pages/Pricing';
import { Features } from './pages/Features';
import { Signup } from './pages/Signup';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { FAQ } from './pages/FAQ';
import { Support } from './pages/Support';
import { MarketingHeader } from './components/MarketingHeader';
import { MarketingFooter } from './components/MarketingFooter';
import { CookieConsent } from './components/CookieConsent';

export function App() {
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

  let content;
  if (pathname === '/signup') {
    content = <Signup navigate={navigate} />;
  } else if (pathname === '/pricing') {
    content = <Pricing navigate={navigate} />;
  } else if (pathname === '/features') {
    content = <Features navigate={navigate} />;
  } else if (pathname === '/faq') {
    content = <FAQ navigate={navigate} />;
  } else if (pathname === '/support') {
    content = <Support navigate={navigate} />;
  } else if (pathname === '/terms') {
    content = <Terms navigate={navigate} />;
  } else if (pathname === '/privacy') {
    content = <Privacy navigate={navigate} />;
  } else if (pathname === '/login') {
    // Redirect to the app login
    window.location.href = 'https://app.forgepsa.com/login';
    return null;
  } else {
    content = <Landing navigate={navigate} />;
  }

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
