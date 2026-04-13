/**
 * Personalized in-app onboarding engine.
 *
 * Source of truth:
 *   - Tenant signup context:   /auth/me → user.onboarding, user.companyType, user.planTier
 *   - Live activity signals:   /api/v1/dashboard/stats  (customer, ticket, contract, invoice counts)
 *   - Manually-marked steps:   PATCH /api/v1/settings/onboarding { progress: { [stepId]: true } }
 *
 * Each step has a `detect(signals)` predicate. If it returns true, the step is
 * "auto-completed" and no manual click is required. Manual marks are merged on top.
 */

export type CompanyType = 'msp' | 'internal_it';
export type PlanTier = 'starter' | 'pro' | 'enterprise';

export interface Signals {
  companyType: CompanyType;
  planTier: PlanTier;
  currentPsa: string | null;            // 'connectwise' | 'halopsa' | ... | 'none' | null
  companySize: string | null;           // '1-5' | '6-20' | '21-50' | '50+'
  needs: string[];                      // Internal IT checkbox set

  customerCount: number;
  contractCount: number;
  ticketCount: number;
  invoiceCount: number;
  hasLaborHours: boolean;

  integrations: {
    quickbooks: boolean;
    pax8: boolean;
    stripe: boolean;
    ninjaone: boolean;
    googleSso: boolean;
    email: boolean;
  };
}

export interface OnboardingStep {
  id: string;
  title: string;
  desc: string;
  cta: { label: string; path: string } | { label: string; action: 'mark' };
  estimatedMinutes: number;
  /** Return true when this step is satisfied by real activity — no manual click needed. */
  detect: (s: Signals) => boolean;
  /** Only include this step when the predicate returns true. */
  appliesWhen?: (s: Signals) => boolean;
}

export interface OnboardingSection {
  id: string;
  title: string;
  subtitle: string;
  steps: OnboardingStep[];
}

/* ─────────────────── Step catalog ─────────────────── */

const commonStart: OnboardingStep[] = [
  {
    id: 'team.invite',
    title: 'Invite your team',
    desc: 'Add your techs so tickets can be assigned and time tracked.',
    cta: { label: 'Manage team', path: '/settings?tab=team' },
    estimatedMinutes: 5,
    detect: () => false, // no signal for users count exposed yet; stays manual
  },
  {
    id: 'sso.google',
    title: 'Connect Google Workspace SSO',
    desc: 'Single sign-on for your techs. Disable in Google to offboard — done.',
    cta: { label: 'Open SSO settings', path: '/settings?tab=integrations' },
    estimatedMinutes: 10,
    detect: (s) => s.integrations.googleSso,
  },
  {
    id: 'email.connect',
    title: 'Connect an email sender',
    desc: 'Gmail OAuth, SMTP, or Mailjet — needed for ticket replies + invoices.',
    cta: { label: 'Configure email', path: '/settings?tab=email' },
    estimatedMinutes: 10,
    detect: (s) => s.integrations.email,
  },
];

const mspSteps: OnboardingStep[] = [
  {
    id: 'msp.customer',
    title: 'Create your first customer',
    desc: 'Everything else (tickets, contracts, invoices) hangs off a customer record.',
    cta: { label: 'Add customer', path: '/customers' },
    estimatedMinutes: 5,
    detect: (s) => s.customerCount > 0,
  },
  {
    id: 'msp.ticket',
    title: 'Log your first ticket',
    desc: 'Test the ticket flow end-to-end: create, assign, add a time entry, resolve.',
    cta: { label: 'Open tickets', path: '/tickets' },
    estimatedMinutes: 5,
    detect: (s) => s.ticketCount > 0,
  },
  {
    id: 'msp.contract',
    title: 'Set up a recurring contract',
    desc: 'Managed services, block hours, flat rate. Drives your first auto-invoice.',
    cta: { label: 'Open contracts', path: '/contracts' },
    estimatedMinutes: 10,
    detect: (s) => s.contractCount > 0,
  },
  {
    id: 'msp.time',
    title: 'Log billable time on a ticket',
    desc: 'Start a timer or enter time manually. Margin math doesn\'t exist without it.',
    cta: { label: 'Open tickets', path: '/tickets' },
    estimatedMinutes: 5,
    detect: (s) => s.hasLaborHours,
  },
  {
    id: 'msp.invoice',
    title: 'Generate your first invoice',
    desc: 'Run invoicing against a contract or ad-hoc against ticket time.',
    cta: { label: 'Open invoices', path: '/invoices' },
    estimatedMinutes: 10,
    detect: (s) => s.invoiceCount > 0,
  },
  {
    id: 'msp.stripe',
    title: 'Connect Stripe for customer payments',
    desc: 'Pay-now links on every invoice. Get paid in 2 days instead of net-30.',
    cta: { label: 'Payment settings', path: '/settings?tab=integrations' },
    estimatedMinutes: 10,
    detect: (s) => s.integrations.stripe,
  },
  {
    id: 'msp.pax8',
    title: 'Connect Pax8 for license margins',
    desc: 'Cost + margin on every contract line that references a Pax8 product.',
    cta: { label: 'Connect Pax8', path: '/settings?tab=integrations' },
    estimatedMinutes: 10,
    detect: (s) => s.integrations.pax8,
  },
  {
    id: 'msp.qbo',
    title: 'Connect QuickBooks Online',
    desc: 'Two-way sync of customers, invoices, and payments. Pro plan only.',
    cta: { label: 'Connect QuickBooks', path: '/settings?tab=integrations' },
    estimatedMinutes: 20,
    detect: (s) => s.integrations.quickbooks,
    appliesWhen: (s) => s.planTier !== 'starter',
  },
  {
    id: 'msp.ninja',
    title: 'Store your NinjaOne credentials',
    desc: 'Credentials storage today; two-way device + patch sync ships in the next release.',
    cta: { label: 'NinjaOne settings', path: '/settings?tab=integrations' },
    estimatedMinutes: 5,
    detect: (s) => s.integrations.ninjaone,
  },
];

const internalItSteps: OnboardingStep[] = [
  {
    id: 'it.customer',
    title: 'Set up your company as the primary customer',
    desc: 'Internal IT uses a single customer record to represent the business you support.',
    cta: { label: 'Add customer', path: '/customers' },
    estimatedMinutes: 3,
    detect: (s) => s.customerCount > 0,
  },
  {
    id: 'it.ticket',
    title: 'File your first ticket',
    desc: 'Even one ticket gets your queue, statuses, and routing working.',
    cta: { label: 'Open tickets', path: '/tickets' },
    estimatedMinutes: 5,
    detect: (s) => s.ticketCount > 0,
  },
  {
    id: 'it.assets',
    title: 'Connect your RMM for asset tracking',
    desc: 'NinjaOne credential store is live today. Device sync ships in our next release.',
    cta: { label: 'Connect RMM', path: '/settings?tab=integrations' },
    estimatedMinutes: 10,
    detect: (s) => s.integrations.ninjaone,
    appliesWhen: (s) => s.needs.includes('asset_tracking') || s.needs.length === 0,
  },
];

/** PSA migration steps only show when signup flagged a source PSA (and it's not 'none'). */
const migrationSteps: OnboardingStep[] = [
  {
    id: 'mig.plan',
    title: 'Open your migration planner',
    desc: 'Interactive, phase-based plan personalized for your current PSA. Auto-saves progress.',
    cta: { label: 'Open planner', path: '/getting-started/migration' },
    estimatedMinutes: 2,
    detect: () => false,
  },
  {
    id: 'mig.export',
    title: 'Export companies from your current PSA',
    desc: 'Get the CSV out today so you can batch-import into ForgePSA this week.',
    cta: { label: 'Mark done', action: 'mark' },
    estimatedMinutes: 45,
    detect: () => false,
  },
  {
    id: 'mig.import',
    title: 'Import your companies CSV',
    desc: 'Settings → Import → ConnectWise / CSV. Spot-check 20 records after upload.',
    cta: { label: 'Open importer', path: '/settings?tab=import' },
    estimatedMinutes: 30,
    detect: (s) => s.customerCount >= 10,
  },
];

/* ─────────────────── Section builder ─────────────────── */

export function buildOnboardingPlan(signals: Signals): OnboardingSection[] {
  const migrating = !!signals.currentPsa && signals.currentPsa !== 'none';

  const sections: OnboardingSection[] = [];

  sections.push({
    id: 'start',
    title: 'Set up your tenant',
    subtitle: 'The three things every ForgePSA account needs before real work starts.',
    steps: commonStart,
  });

  if (signals.companyType === 'msp') {
    sections.push({
      id: 'msp-core',
      title: 'Activate your MSP workflow',
      subtitle: 'Customer → ticket → time → contract → invoice. Validate the chain.',
      steps: mspSteps,
    });
  } else {
    sections.push({
      id: 'it-core',
      title: 'Activate your IT support workflow',
      subtitle: 'Tickets, users, and assets — the billing-heavy steps stay hidden.',
      steps: internalItSteps,
    });
  }

  if (migrating) {
    sections.push({
      id: 'migration',
      title: `Migrate from ${labelForPsa(signals.currentPsa)}`,
      subtitle: 'Personalized migration path based on the PSA you flagged at signup.',
      steps: migrationSteps,
    });
  }

  // Filter per-step `appliesWhen`
  return sections.map((sec) => ({
    ...sec,
    steps: sec.steps.filter((step) => !step.appliesWhen || step.appliesWhen(signals)),
  }));
}

export function labelForPsa(v: string | null | undefined): string {
  switch (v) {
    case 'connectwise': return 'ConnectWise';
    case 'halopsa':     return 'HaloPSA';
    case 'autotask':    return 'Autotask';
    case 'syncro':      return 'Syncro';
    case 'superops':    return 'SuperOps';
    case 'other':       return 'your current PSA';
    default:            return 'another PSA';
  }
}

/** Merge manual progress over auto-detected progress. */
export function isStepDone(
  step: OnboardingStep,
  signals: Signals,
  manualProgress: Record<string, boolean>,
): boolean {
  if (manualProgress[step.id]) return true;
  return step.detect(signals);
}

export function computeProgress(
  sections: OnboardingSection[],
  signals: Signals,
  manualProgress: Record<string, boolean>,
): { total: number; done: number; pct: number } {
  let total = 0;
  let done = 0;
  for (const sec of sections) {
    for (const s of sec.steps) {
      total += 1;
      if (isStepDone(s, signals, manualProgress)) done += 1;
    }
  }
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
