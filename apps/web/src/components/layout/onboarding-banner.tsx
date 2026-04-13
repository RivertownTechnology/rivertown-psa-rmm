import { Rocket, X, ArrowRight } from 'lucide-react';
import { useOnboarding } from '@/hooks/use-onboarding';

interface Props {
  onNavigate: (path: string) => void;
}

/**
 * Compact strip that sits under the TrialBanner on every page of the tenant app.
 * Renders only when there is useful onboarding work remaining AND the user
 * hasn't dismissed within the last 7 days. Clicking the CTA deep-links into
 * /getting-started which resumes at the first incomplete step.
 */
export function OnboardingBanner({ onNavigate }: Props) {
  const { bannerVisible, progress, dismissBanner } = useOnboarding();

  if (!bannerVisible) return null;

  const remaining = progress.total - progress.done;

  return (
    <div className="bg-gradient-to-r from-brand-50 to-cyan-50 dark:from-brand-950/60 dark:to-cyan-950/60 border-b border-brand-200/70 dark:border-brand-800/60 text-slate-900 dark:text-slate-100">
      <div className="max-w-full px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Progress ring */}
        <div className="relative h-8 w-8 shrink-0" aria-hidden>
          <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
            <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="3.5" fill="none" className="text-slate-200 dark:text-slate-700" />
            <circle
              cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round"
              strokeDasharray={`${(progress.pct / 100) * 87.964} 87.964`}
              className="text-brand-600 dark:text-brand-400"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
            {progress.pct}%
          </div>
        </div>

        <div className="inline-flex items-center gap-2 min-w-0 flex-1">
          <Rocket className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-semibold">Setup {progress.pct}% complete</span>
            <span className="text-slate-600 dark:text-slate-400"> — {remaining} {remaining === 1 ? 'step' : 'steps'} left to activate ForgePSA.</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onNavigate('/getting-started')}
            className="inline-flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm"
          >
            Continue setup <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={dismissBanner}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-white/50 dark:hover:bg-slate-800"
            aria-label="Hide onboarding banner for 7 days"
            title="Hide for now"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
