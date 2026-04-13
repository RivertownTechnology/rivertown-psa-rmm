export function MarketingFooter({ navigate }: { navigate: (p: string) => void }) {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <button onClick={() => navigate('/')} className="flex items-center mb-3" aria-label="ForgePSA home">
            <img src="/forgepsa-logo.png" alt="ForgePSA" className="h-12 w-auto" />
          </button>
          <p className="text-sm text-slate-400">A modern PSA built by an MSP, for MSPs. Native NinjaRMM integration with more on the way.</p>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Product</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/features')} className="hover:text-white">Features</button></li>
            <li><button onClick={() => navigate('/pricing')} className="hover:text-white">Pricing</button></li>
            <li><button onClick={() => navigate('/faq')} className="hover:text-white">FAQ</button></li>
            <li><a href="https://app.forgepsa.com" className="hover:text-white">Sign in</a></li>
            <li><button onClick={() => navigate('/signup')} className="hover:text-white">Start free trial</button></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Support</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/support')} className="hover:text-white">Help Center</button></li>
            <li><a href="mailto:support@forgepsa.com" className="hover:text-white">Email support</a></li>
            <li><a href="mailto:hello@forgepsa.com" className="hover:text-white">Contact sales</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Legal</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/terms')} className="hover:text-white">Terms</button></li>
            <li><button onClick={() => navigate('/privacy')} className="hover:text-white">Privacy</button></li>
            <li>
              <button
                onClick={() => (window as any).forgepsaOpenCookiePrefs?.()}
                className="hover:text-white"
              >
                Cookie preferences
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} ForgePSA. All rights reserved.
      </div>
    </footer>
  );
}
