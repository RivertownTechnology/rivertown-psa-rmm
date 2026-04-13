import { Twitter, Facebook, Linkedin } from 'lucide-react';

// Social URLs — kept as placeholders until the accounts are live.
// Update these to the real URLs (or import from env) when ready.
const SOCIAL_X = '#';
const SOCIAL_FACEBOOK = '#';
const SOCIAL_LINKEDIN = '#';

export function MarketingFooter({ navigate }: { navigate: (p: string) => void }) {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-5">
        <div className="md:col-span-2">
          <button onClick={() => navigate('/')} className="flex items-center mb-3" aria-label="ForgePSA home">
            <img src="/forgepsa-logo.png" alt="ForgePSA" className="h-12 w-auto" />
          </button>
          <p className="text-sm text-slate-400 max-w-sm mb-5">
            A modern PSA built by an MSP, for MSPs. No user minimum, NinjaOne integration coming next, 45-day no-card trial.
          </p>
          <div className="flex items-center gap-2">
            <SocialLink href={SOCIAL_X} label="ForgePSA on X"><Twitter className="h-4 w-4" /></SocialLink>
            <SocialLink href={SOCIAL_LINKEDIN} label="ForgePSA on LinkedIn"><Linkedin className="h-4 w-4" /></SocialLink>
            <SocialLink href={SOCIAL_FACEBOOK} label="ForgePSA on Facebook"><Facebook className="h-4 w-4" /></SocialLink>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Product</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/features')} className="hover:text-white">Features</button></li>
            <li><button onClick={() => navigate('/pricing')} className="hover:text-white">Pricing</button></li>
            <li><button onClick={() => navigate('/compare')} className="hover:text-white">Compare</button></li>
            <li><button onClick={() => navigate('/changelog')} className="hover:text-white">Changelog</button></li>
            <li><button onClick={() => navigate('/signup')} className="hover:text-white">Start free trial</button></li>
            <li><a href="https://app.forgepsa.com" className="hover:text-white">Sign in</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Company</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/philosophy')} className="hover:text-white">Philosophy</button></li>
            <li><button onClick={() => navigate('/blog')} className="hover:text-white">Blog</button></li>
            <li><button onClick={() => navigate('/demo')} className="hover:text-white">Book a demo</button></li>
            <li><a href="mailto:hello@forgepsa.com" className="hover:text-white">Contact sales</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">Resources</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/faq')} className="hover:text-white">FAQ</button></li>
            <li><button onClick={() => navigate('/support')} className="hover:text-white">Help Center</button></li>
            <li><button onClick={() => navigate('/guides/migration-checklist')} className="hover:text-white">Migration checklist</button></li>
            <li><a href="mailto:support@forgepsa.com" className="hover:text-white">Email support</a></li>
          </ul>
          <h4 className="font-semibold text-white mt-5 mb-3 text-sm">Legal</h4>
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

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
    >
      {children}
    </a>
  );
}
