import { AlertCircle, Clock, CreditCard, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Props {
  onNavigate: (path: string) => void;
}

export function TrialBanner({ onNavigate }: Props) {
  const { user } = useAuth();
  if (!user) return null;

  const status = user.subscriptionStatus;
  const trialDays = user.trialDaysRemaining;
  const graceDays = user.pastDueDaysRemaining;

  // Active subscription — no banner
  if (status === 'active') return null;

  // Locked-out — handled by the locked-out screen, not a banner
  if (user.lockedOut) return null;

  // Past-due with grace period remaining
  if (status === 'past_due' && graceDays != null) {
    return (
      <Banner
        tone="red"
        icon={<AlertCircle className="h-4 w-4" />}
        message={
          <>
            <strong>Payment failed.</strong>{' '}
            You have <strong>{graceDays} day{graceDays === 1 ? '' : 's'}</strong> to update billing before your account is locked.
          </>
        }
        cta="Update payment"
        onCta={() => onNavigate('/billing')}
      />
    );
  }

  // Trial expired but not yet locked
  if (status === 'trial' && user.trialExpired) {
    return (
      <Banner
        tone="red"
        icon={<AlertCircle className="h-4 w-4" />}
        message={<><strong>Your free trial has ended.</strong> Add a subscription to continue using ForgePSA.</>}
        cta="Purchase now"
        onCta={() => onNavigate('/billing')}
      />
    );
  }

  // Active trial
  if (status === 'trial' && typeof trialDays === 'number') {
    const tone = trialDays <= 7 ? 'amber' : 'blue';
    const Icon = trialDays <= 7 ? Clock : Sparkles;
    return (
      <Banner
        tone={tone}
        icon={<Icon className="h-4 w-4" />}
        message={
          <>
            <strong>{trialDays} day{trialDays === 1 ? '' : 's'} left</strong> in your free trial.
            {trialDays <= 7 && ' Upgrade now to keep full access.'}
          </>
        }
        cta="Purchase now"
        onCta={() => onNavigate('/billing')}
      />
    );
  }

  return null;
}

function Banner({
  tone, icon, message, cta, onCta,
}: {
  tone: 'blue' | 'amber' | 'red';
  icon: React.ReactNode;
  message: React.ReactNode;
  cta: string;
  onCta: () => void;
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-900 border-blue-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    red: 'bg-red-50 text-red-900 border-red-200',
  }[tone];

  return (
    <div className={`border-b ${toneClasses}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{message}</span>
        </div>
        <button
          onClick={onCta}
          className="shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-current/20 px-3 py-1 rounded-md text-xs font-semibold transition-colors shadow-sm"
        >
          <CreditCard className="h-3.5 w-3.5" />
          {cta}
        </button>
      </div>
    </div>
  );
}
