import { CheckCircle2, Circle, ArrowRight, Clock, Rocket, Sparkles, RefreshCw, Eye } from 'lucide-react';
import { useOnboarding } from '@/hooks/use-onboarding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { labelForPsa, type OnboardingStep } from '@/lib/onboarding';

interface Props {
  onNavigate: (path: string) => void;
}

export function GettingStartedPage({ onNavigate }: Props) {
  const { user } = useAuth();
  const { plan, progress, isDone, toggleStep, reopenBanner, loading, signals } = useOnboarding();

  if (loading || !user || !signals) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your personalized setup…</div>;
  }

  const companyName = user.tenantName ?? 'your tenant';
  const personalizedIntro = buildIntro({
    companyType: signals.companyType,
    currentPsa: signals.currentPsa,
    companySize: signals.companySize,
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white p-6 sm:p-8 shadow-lg">
        <div className="absolute -top-10 -right-10 opacity-20 hidden sm:block">
          <Rocket className="h-48 w-48" />
        </div>
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-white/15 rounded-full px-2.5 py-1 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Personalized for {companyName}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Get set up in ForgePSA</h1>
          <p className="text-brand-100 max-w-2xl text-sm sm:text-base">{personalizedIntro}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ProgressRing pct={progress.pct} />
            <div className="text-sm">
              <div className="font-semibold">
                {progress.done} of {progress.total} steps complete
              </div>
              <div className="text-brand-100">
                {progress.pct === 100
                  ? 'Setup complete. Nice work.'
                  : 'Steps auto-complete as you use the product.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hint row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Progress auto-updates from your activity</span>
        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> <button onClick={reopenBanner} className="underline hover:text-foreground">Re-show the dashboard banner</button></span>
      </div>

      {/* Sections */}
      {plan.map((section) => {
        const sectionDone = section.steps.every((s) => isDone(s.id));
        return (
          <Card key={section.id} className={sectionDone ? 'border-emerald-400/60 dark:border-emerald-700/60' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {sectionDone && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {section.title}
                  </CardTitle>
                  <CardDescription>{section.subtitle}</CardDescription>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {section.steps.filter((s) => isDone(s.id)).length}/{section.steps.length}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {section.steps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    done={isDone(step.id)}
                    manuallyMarked={!!user.onboarding?.progress?.[step.id]}
                    onNavigate={onNavigate}
                    onToggle={() => toggleStep(step.id)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {/* Final CTA */}
      <Card className="border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/40">
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-foreground mb-1">Stuck on a step? We\u2019re on it.</div>
            <div className="text-sm text-muted-foreground">
              Email support@forgepsa.com or hit the chat bubble. Real engineers answer.
            </div>
          </div>
          <Button variant="outline" onClick={() => onNavigate('/support')}>Open support</Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── Subcomponents ─────────────── */

function StepRow({
  step, done, manuallyMarked, onNavigate, onToggle,
}: {
  step: OnboardingStep;
  done: boolean;
  manuallyMarked: boolean;
  onNavigate: (p: string) => void;
  onToggle: () => void;
}) {
  const ctaIsNav = 'path' in step.cta;

  return (
    <li className={`rounded-lg border p-3 transition-colors ${
      done
        ? 'border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-border bg-background hover:border-brand-300 dark:hover:border-brand-700'
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="shrink-0 mt-0.5"
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          title={manuallyMarked ? 'Manually marked — click to undo' : (done ? 'Auto-detected from your activity' : 'Mark complete')}
        >
          {done
            ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            : <Circle className="h-5 w-5 text-muted-foreground" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {step.title}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" /> ~{step.estimatedMinutes}m
            </span>
            {done && !manuallyMarked && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                Auto-detected
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">{step.desc}</div>
        </div>

        <div className="shrink-0">
          {ctaIsNav ? (
            <Button
              variant={done ? 'outline' : 'default'}
              size="sm"
              onClick={() => onNavigate((step.cta as { path: string }).path)}
            >
              {step.cta.label}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onToggle}>
              {done ? 'Undo' : step.cta.label}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="none" className="text-white/20" />
        <circle
          cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 94.248} 94.248`}
          className="text-white"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}%</div>
    </div>
  );
}

function buildIntro({
  companyType, currentPsa, companySize,
}: {
  companyType: 'msp' | 'internal_it';
  currentPsa: string | null;
  companySize: string | null;
}): string {
  const parts: string[] = [];
  if (companyType === 'msp') {
    parts.push('MSP workflow activated — billing, contracts, and time tracking are in the list below.');
  } else {
    parts.push('Internal IT mode — we\u2019ve hidden the billing-heavy steps so you can focus on tickets, users, and assets.');
  }
  if (companySize === '1-5') {
    parts.push('Small team detected — we\u2019re showing a lean setup (no workflow automation step yet).');
  } else if (companySize === '21-50' || companySize === '50+') {
    parts.push('Larger team detected — SLAs and role management are surfaced so you can delegate early.');
  }
  if (currentPsa && currentPsa !== 'none') {
    parts.push(`Migrating from ${labelForPsa(currentPsa)}? We added a migration section at the bottom.`);
  }
  return parts.join(' ');
}
