import { useEffect, useState } from 'react';
import { Cookie, X, Check, Settings } from 'lucide-react';

/**
 * GDPR/CCPA-friendly cookie banner with Google Consent Mode v2.
 *
 * Behavior:
 *   - On first visit, banner appears bottom-fixed with Accept / Necessary only / Customize
 *   - Choices stored in localStorage under `forgepsa.cookieConsent` (versioned)
 *   - Google Analytics tag is preloaded with all consent denied; when the user accepts
 *     analytics, we call gtag('consent', 'update', { analytics_storage: 'granted' })
 *   - Footer link `(window as any).forgepsaOpenCookiePrefs()` re-opens the modal so
 *     users can change their mind from the footer link.
 */

type ConsentState = {
  necessary: true;          // always true — required for site to function
  analytics: boolean;       // GA4
  marketing: boolean;       // future: Meta pixel, LinkedIn, etc.
  acceptedAt: string;
  version: number;
};

const STORAGE_KEY = 'forgepsa.cookieConsent';
const CONSENT_VERSION = 1;

function loadConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null; // re-prompt on version bump
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(state: ConsentState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  applyConsentToGoogle(state);
}

function applyConsentToGoogle(state: ConsentState) {
  const gtag = (window as any).gtag;
  if (typeof gtag !== 'function') return;
  gtag('consent', 'update', {
    ad_storage: state.marketing ? 'granted' : 'denied',
    ad_user_data: state.marketing ? 'granted' : 'denied',
    ad_personalization: state.marketing ? 'granted' : 'denied',
    analytics_storage: state.analytics ? 'granted' : 'denied',
  });
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = loadConsent();
    if (!existing) {
      setOpen(true);
    } else {
      // Re-apply choices to Google on every page load
      applyConsentToGoogle(existing);
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }

    // Expose a global so footer link can reopen the modal
    (window as any).forgepsaOpenCookiePrefs = () => {
      const e = loadConsent();
      if (e) {
        setAnalytics(e.analytics);
        setMarketing(e.marketing);
      }
      setShowCustomize(true);
      setOpen(true);
    };
  }, []);

  function handleAcceptAll() {
    const state: ConsentState = {
      necessary: true, analytics: true, marketing: true,
      acceptedAt: new Date().toISOString(), version: CONSENT_VERSION,
    };
    saveConsent(state);
    setOpen(false);
  }

  function handleNecessaryOnly() {
    const state: ConsentState = {
      necessary: true, analytics: false, marketing: false,
      acceptedAt: new Date().toISOString(), version: CONSENT_VERSION,
    };
    saveConsent(state);
    setOpen(false);
  }

  function handleSaveCustom() {
    const state: ConsentState = {
      necessary: true, analytics, marketing,
      acceptedAt: new Date().toISOString(), version: CONSENT_VERSION,
    };
    saveConsent(state);
    setOpen(false);
    setShowCustomize(false);
  }

  if (!open) return null;

  return (
    <>
      {showCustomize && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCustomize(false)} />}
      <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 md:p-6 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl">
          {!showCustomize ? (
            <div className="p-4 sm:p-5 md:p-6">
              <div className="flex items-start gap-3 mb-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 shrink-0">
                  <Cookie className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">We use cookies</h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Strictly necessary cookies keep the site working. Optional analytics cookies help us improve
                    the experience. We <strong className="text-slate-900 dark:text-slate-100">never</strong> sell
                    your data and we don't use marketing cookies by default. See our{' '}
                    <a href="/privacy" className="text-brand-600 dark:text-brand-400 underline">Privacy Policy</a>.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <button
                  onClick={() => setShowCustomize(true)}
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Customize
                </button>
                <button
                  onClick={handleNecessaryOnly}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold text-sm px-4 py-2 rounded-md"
                >
                  Necessary only
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-md inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" /> Accept all
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowCustomize(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Cookie preferences</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
                  Choose which categories of cookies you accept. You can change these any time from the footer link.
                </p>

                <div className="space-y-4">
                  <CookieRow
                    title="Strictly necessary"
                    desc="Required for sign-in, security, and basic site function. Cannot be disabled."
                    enabled
                    locked
                    onChange={() => {}}
                  />
                  <CookieRow
                    title="Analytics"
                    desc="Aggregated, non-personal usage data so we can improve the product. Google Analytics 4 with IP anonymization."
                    enabled={analytics}
                    onChange={setAnalytics}
                  />
                  <CookieRow
                    title="Marketing"
                    desc="Off by default. We do not currently use marketing cookies but reserve the option for future advertising attribution."
                    enabled={marketing}
                    onChange={setMarketing}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={handleNecessaryOnly}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold text-sm px-4 py-2 rounded-md"
                  >
                    Reject all optional
                  </button>
                  <button
                    onClick={handleSaveCustom}
                    className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-md"
                  >
                    Save preferences
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CookieRow({
  title, desc, enabled, locked, onChange,
}: {
  title: string;
  desc: string;
  enabled: boolean;
  locked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-200 dark:border-slate-800 last:border-0">
      <button
        onClick={() => !locked && onChange(!enabled)}
        disabled={locked}
        className={`shrink-0 mt-0.5 relative w-10 h-5 rounded-full transition-colors ${
          enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
        } ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-pressed={enabled}
        aria-label={`Toggle ${title}`}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`} />
      </button>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
          {locked && <span className="ml-2 text-xs font-normal text-slate-500">always on</span>}
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
