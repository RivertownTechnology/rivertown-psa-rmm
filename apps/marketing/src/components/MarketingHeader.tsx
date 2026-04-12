import { Hammer } from 'lucide-react';

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

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold text-lg">
          <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
            <Hammer className="h-5 w-5" />
          </div>
          ForgePSA
        </button>

        <nav className="hidden md:flex items-center gap-8">
          {navItem('Features', '/features')}
          {navItem('Pricing', '/pricing')}
          <a href="https://app.forgepsa.com" className="text-sm font-medium text-slate-600 hover:text-slate-900">Sign in</a>
        </nav>

        <button
          onClick={() => navigate('/signup')}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Start free trial
        </button>
      </div>
    </header>
  );
}
