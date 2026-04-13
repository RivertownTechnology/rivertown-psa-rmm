export function MarketingHeader({ pathname, navigate }: { pathname: string; navigate: (p: string) => void }) {
  const navItem = (label: string, path: string) => (
    <button
      onClick={() => navigate(path)}
      className={`text-sm font-medium hover:text-slate-900 transition-colors ${
        pathname === path ? 'text-slate-900' : 'text-slate-600'
      }`}
    >
      {label}
    </button>
  );

  const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center" aria-label="ForgePSA home">
          <img src="/logo.svg" alt="ForgePSA" className="h-9 w-auto" />
        </button>

        <nav className="hidden md:flex items-center gap-8">
          {navItem('Features', '/features')}
          {navItem('Pricing', '/pricing')}
          {navItem('FAQ', '/faq')}
          {navItem('Support', '/support')}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={appUrl}
            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Sign in
          </a>
          <button
            onClick={() => navigate('/signup')}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Start free trial
          </button>
        </div>
      </div>
    </header>
  );
}
