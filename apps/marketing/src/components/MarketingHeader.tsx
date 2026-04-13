import { useState } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export function MarketingHeader({ pathname, navigate }: { pathname: string; navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const { resolved, toggle } = useTheme();

  const navItem = (label: string, path: string) => (
    <button
      onClick={() => { navigate(path); setOpen(false); }}
      className={`text-sm font-medium transition-colors ${
        pathname === path
          ? 'text-slate-900 dark:text-white'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        <button onClick={() => { navigate('/'); setOpen(false); }} className="flex items-center shrink-0" aria-label="ForgePSA home">
          <img src="/forgepsa-logo.png" alt="ForgePSA" className="h-10 sm:h-12 w-auto" />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItem('Features', '/features')}
          {navItem('Pricing', '/pricing')}
          {navItem('FAQ', '/faq')}
          {navItem('Support', '/support')}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden sm:flex items-center gap-2">
          <a
            href={appUrl}
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm px-3 lg:px-4 py-2 rounded-lg transition-colors"
          >
            Sign in
          </a>
          <button
            onClick={() => navigate('/signup')}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-3 lg:px-4 py-2 rounded-lg transition-colors"
          >
            Start free trial
          </button>
          <button
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-1 inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
          >
            {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Mobile: theme toggle + menu */}
        <div className="sm:hidden flex items-center gap-1">
          <button
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            <MobileNavLink onClick={() => { navigate('/features'); setOpen(false); }}>Features</MobileNavLink>
            <MobileNavLink onClick={() => { navigate('/pricing'); setOpen(false); }}>Pricing</MobileNavLink>
            <MobileNavLink onClick={() => { navigate('/faq'); setOpen(false); }}>FAQ</MobileNavLink>
            <MobileNavLink onClick={() => { navigate('/support'); setOpen(false); }}>Support</MobileNavLink>
            <div className="border-t border-slate-200 dark:border-slate-800 mt-2 pt-3 flex flex-col gap-2">
              <a
                href={appUrl}
                className="text-center bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm px-4 py-2.5 rounded-lg"
              >
                Sign in
              </a>
              <button
                onClick={() => { navigate('/signup'); setOpen(false); }}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg"
              >
                Start free trial
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileNavLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left text-base font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-2.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
