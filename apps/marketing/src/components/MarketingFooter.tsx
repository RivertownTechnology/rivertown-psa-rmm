import { Hammer } from 'lucide-react';

export function MarketingFooter({ navigate }: { navigate: (p: string) => void }) {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold text-lg text-white mb-3">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
              <Hammer className="h-5 w-5" />
            </div>
            ForgePSA
          </button>
          <p className="text-sm text-slate-400">PSA + RMM for modern MSPs. Built to replace expensive legacy tools.</p>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Product</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/features')} className="hover:text-white">Features</button></li>
            <li><button onClick={() => navigate('/pricing')} className="hover:text-white">Pricing</button></li>
            <li><a href="https://app.forgepsa.com" className="hover:text-white">Sign in</a></li>
            <li><button onClick={() => navigate('/signup')} className="hover:text-white">Start free trial</button></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Company</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="mailto:hello@forgepsa.com" className="hover:text-white">Contact</a></li>
            <li><a href="mailto:support@forgepsa.com" className="hover:text-white">Support</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Legal</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/terms')} className="hover:text-white">Terms</button></li>
            <li><button onClick={() => navigate('/privacy')} className="hover:text-white">Privacy</button></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} ForgePSA. All rights reserved.
      </div>
    </footer>
  );
}
