import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  buildOnboardingPlan, computeProgress, isStepDone,
  type OnboardingSection, type Signals,
} from '@/lib/onboarding';

// Matches the shape returned by GET /api/v1/dashboard/stats.
interface DashboardStats {
  customers?: { total?: number };
  tickets?: { open?: number; new?: number; total?: number };
  invoices?: { open?: number };
  contracts?: { monthlyRevenueCents?: number };
  labor?: { totalHours?: number };
  // These are derived below — the dashboard endpoint doesn't expose all counts
  // directly, so we fall back to "exists if > 0 on any relevant metric".
}

interface IntegrationStatuses {
  quickbooks?: { connected?: boolean };
  pax8?: { connected?: boolean };
  ninjaone?: { connected?: boolean };
  stripe?: { connected?: boolean };
  googleSso?: { connected?: boolean };
  email?: { connected?: boolean };
}

const BANNER_DISMISS_DAYS = 7;
const POLL_INTERVAL_MS = 60_000;

/**
 * Primary hook for the in-app onboarding experience.
 *
 * Returns a ready-to-render plan (sections + steps), computed progress, and
 * helpers for marking steps complete + dismissing the banner.
 */
export function useOnboarding() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatuses>({});
  const [loading, setLoading] = useState(true);

  const fetchSignals = useCallback(async () => {
    // Pull dashboard stats — best-effort, ignore errors (new tenants may 404).
    const results = await Promise.allSettled([
      api<DashboardStats>('/dashboard/stats'),
      api<{ connected?: boolean }>('/settings/quickbooks/status'),
    ]);

    const statsResult = results[0];
    const qboResult = results[1];
    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    if (qboResult.status === 'fulfilled') {
      setIntegrations((s) => ({ ...s, quickbooks: { connected: !!qboResult.value?.connected } }));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchSignals();
    const id = window.setInterval(fetchSignals, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, fetchSignals]);

  const signals: Signals | null = useMemo(() => {
    if (!user) return null;

    const ob = user.onboarding ?? {
      currentPsa: null, companySize: null, industry: null,
      supportedUsersRange: null, needs: [] as string[],
      progress: {}, dismissedAt: null,
    };

    return {
      companyType: (user.companyType ?? 'msp') as 'msp' | 'internal_it',
      planTier: (user.planTier ?? 'starter') as 'starter' | 'pro' | 'enterprise',
      currentPsa: ob.currentPsa,
      companySize: ob.companySize,
      needs: ob.needs ?? [],
      customerCount: stats?.customers?.total ?? 0,
      contractCount: (stats?.contracts?.monthlyRevenueCents ?? 0) > 0 ? 1 : 0,
      ticketCount: stats?.tickets?.total ?? stats?.tickets?.open ?? stats?.tickets?.new ?? 0,
      invoiceCount: stats?.invoices?.open ?? 0,
      hasLaborHours: (stats?.labor?.totalHours ?? 0) > 0,
      integrations: {
        quickbooks: !!integrations.quickbooks?.connected,
        pax8: !!integrations.pax8?.connected,
        stripe: !!integrations.stripe?.connected,
        ninjaone: !!integrations.ninjaone?.connected,
        googleSso: !!integrations.googleSso?.connected,
        email: !!integrations.email?.connected,
      },
    };
  }, [user, stats, integrations]);

  const plan: OnboardingSection[] = useMemo(() => (
    signals ? buildOnboardingPlan(signals) : []
  ), [signals]);

  const manualProgress = user?.onboarding?.progress ?? {};

  const progress = useMemo(() => (
    signals ? computeProgress(plan, signals, manualProgress) : { total: 0, done: 0, pct: 0 }
  ), [plan, signals, manualProgress]);

  const isDone = useCallback(
    (stepId: string) => {
      if (!signals) return false;
      const step = plan.flatMap((s) => s.steps).find((s) => s.id === stepId);
      if (!step) return false;
      return isStepDone(step, signals, manualProgress);
    },
    [plan, signals, manualProgress],
  );

  /** Toggle a step's manual-complete flag. Optimistic-ish; refetches /auth/me at the end. */
  const toggleStep = useCallback(async (stepId: string) => {
    if (!user) return;
    const next = { ...manualProgress, [stepId]: !manualProgress[stepId] };
    await api('/settings/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ progress: { [stepId]: !manualProgress[stepId] } }),
    });
    // Keep the optimistic update by refreshing /auth/me
    await refreshUser();
    void next;
  }, [user, manualProgress, refreshUser]);

  const dismissBanner = useCallback(async () => {
    await api('/settings/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ dismissedAt: new Date().toISOString() }),
    });
    await refreshUser();
  }, [refreshUser]);

  const reopenBanner = useCallback(async () => {
    await api('/settings/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ dismissedAt: null }),
    });
    await refreshUser();
  }, [refreshUser]);

  /**
   * Banner visibility rule:
   *   - Hide for fully-complete plans
   *   - Hide if user dismissed within the last 7 days
   *   - Hide while auth/stats are loading
   */
  const bannerVisible = useMemo(() => {
    if (!user || loading) return false;
    if (progress.pct === 100) return false;
    const d = user.onboarding?.dismissedAt;
    if (d) {
      const age = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
      if (age < BANNER_DISMISS_DAYS) return false;
    }
    return true;
  }, [user, loading, progress.pct]);

  return {
    loading,
    signals,
    plan,
    progress,
    isDone,
    toggleStep,
    dismissBanner,
    reopenBanner,
    bannerVisible,
  };
}
