import { useEffect, useMemo, useState, useRef } from 'react';
import {
  FileCheck2, ChevronDown, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  Clock, Download, Mail, RotateCcw, Sparkles, ArrowRight, Settings2, ShieldAlert,
  Calendar, Database, Wrench, PlayCircle, ClipboardCheck,
} from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

/* ─────────────────────── Types ─────────────────────── */

type SourcePSA = 'connectwise' | 'halopsa' | 'autotask' | 'syncro' | 'superops' | 'other';
type Tier = 'small' | 'mid' | 'large';
type Risk = 'low' | 'medium' | 'high';

interface TaskFilter { psas?: SourcePSA[]; tiers?: Tier[] }

interface Task {
  id: string;
  title: string;
  why: string;
  breaks: string;
  advanced?: string;
  risk: Risk;
  minutes: number;
  filter?: TaskFilter;
}

interface Phase {
  id: string;
  title: string;
  subtitle: string;
  timing: string;
  icon: React.ReactNode;
  tasks: Task[];
}

interface Personalization {
  psa: SourcePSA | '';
  techs: number;
  customersBucket: 'under_50' | '50_200' | '200_plus' | '';
}

interface SavedState {
  personalization: Personalization;
  completed: Record<string, boolean>;
  expanded: Record<string, boolean>;
  advanced: Record<string, boolean>;
  activePhaseId: string;
}

/* ─────────────────────── Content ─────────────────────── */

const PHASES: Phase[] = [
  {
    id: 'pre',
    title: 'Pre-Migration',
    subtitle: 'Align the team, set the date, know what you\'re moving.',
    timing: '3–4 weeks before cutover',
    icon: <Calendar className="h-5 w-5" />,
    tasks: [
      {
        id: 'pre.date', title: 'Pick your cutover date',
        risk: 'low', minutes: 10,
        why: 'A month-boundary cutover keeps your billing periods clean and your reconciliation sane. Mid-week avoids weekend surprises.',
        breaks: 'Mid-month cutovers split invoices across two tools — you\'ll spend the next 90 days reconciling partial periods by hand.',
        advanced: 'If you run on a non-calendar billing period (e.g. 15th → 14th), align to that boundary instead. Avoid cutting over the week before a quarter-end close.',
      },
      {
        id: 'pre.owner', title: 'Assign a single migration owner',
        risk: 'high', minutes: 15,
        why: 'One person, 4–6 weeks, at least 30% of their time. Distributed ownership kills migrations in week three.',
        breaks: 'Without a single owner, decisions stall, tasks get dropped, and the project slips by 2x.',
        advanced: 'Owner does NOT need to be the most technical person — they need the authority to cancel meetings and say no. Usually an Ops Manager or a senior tech.',
      },
      {
        id: 'pre.baseline', title: 'Pull a baseline inventory count',
        risk: 'medium', minutes: 30,
        why: 'You can\'t validate "everything moved" without a starting number. Record: companies, contacts, active contracts, open tickets, unpaid invoices, active integrations.',
        breaks: 'Post-cutover, if you notice 80 customers are missing, you won\'t know if it\'s 80 of 500 or 80 of 2,000 without a baseline.',
        advanced: 'Also capture total closed-ticket count, historical invoice count, and total time-entries. You\'ll use these for the 30-day reconciliation.',
      },
      {
        id: 'pre.integrations', title: 'Audit your current integrations',
        risk: 'medium', minutes: 45,
        why: 'Know exactly what disappears at cutover. QBO, RMM, payment, SMS, email, Pax8 — each one needs a migration plan of its own.',
        breaks: 'Missing one integration means dropped sync on day one. Most common miss: the custom Zapier workflow nobody remembers.',
      },
      {
        id: 'pre.reports', title: 'Screenshot every custom report you rely on',
        risk: 'medium', minutes: 30,
        why: 'Custom SQL queries and dashboard widgets almost never port 1:1. Capture what they look like today so you can rebuild equivalents.',
        breaks: 'Miss this and you\'ll hit month-end close without your MRR report.',
      },
      {
        id: 'pre.workflow', title: 'Document your ticket workflow',
        risk: 'low', minutes: 30,
        why: 'Statuses, priorities, escalation rules — write them down. You\'ll rebuild them in ForgePSA and hand this doc to techs during training.',
        breaks: 'Techs create tickets in the wrong status because nobody wrote down the rule.',
      },
      {
        id: 'pre.announce', title: 'Announce the migration to your team + customers',
        risk: 'low', minutes: 20,
        why: 'Migration fatigue hits harder when it\'s a surprise. Techs need 2+ weeks of mental prep. Customers appreciate a "heads up — invoice will look different next month" email.',
        breaks: 'Surprise migrations = tech resistance, inbound support tickets, and at least one accusing email from a customer who thinks you got hacked.',
      },
    ],
  },
  {
    id: 'cleanup',
    title: 'Data Cleanup',
    subtitle: 'Don\'t import yesterday\'s garbage into tomorrow\'s tool.',
    timing: '2–3 weeks before',
    icon: <Database className="h-5 w-5" />,
    tasks: [
      {
        id: 'clean.dedupe', title: 'Deduplicate companies',
        risk: 'medium', minutes: 120,
        why: 'Most PSAs accumulate 15–25% duplicate company records over the years. Imports without dedupe arrive as two records — and every future ticket routes to the wrong one.',
        breaks: 'Post-cutover invoices go to ghost customers. Tickets assigned to the wrong record. Historical reporting splits across dupes.',
        advanced: 'Use your current tool\'s merge feature first; what remains after that pass is the real problem. Sort by phone number and address line 1 to catch obvious dupes the built-in tool missed.',
        filter: { psas: ['connectwise', 'halopsa', 'autotask'] },
      },
      {
        id: 'clean.stale_tickets', title: 'Close or archive stale tickets',
        risk: 'low', minutes: 60,
        why: 'If a ticket\'s been open 18 months with no activity, it\'s not a real ticket. Closing it before cutover means you import 200 open tickets, not 2,000.',
        breaks: 'A bloated open-ticket list destroys tech morale on day one and makes the new dashboard useless.',
      },
      {
        id: 'clean.contacts', title: 'Archive inactive contacts',
        risk: 'medium', minutes: 45,
        why: 'Portal users you haven\'t thought about in 5 years. IT directors who left 3 years ago. Import them and you\'ll send welcome emails into the void.',
        breaks: 'Bounced welcome emails hurt deliverability across your whole domain.',
      },
      {
        id: 'clean.contracts', title: 'Expire dead contracts',
        risk: 'high', minutes: 90,
        why: 'Auto-renewing contracts that auto-renewed through 3 CEOs. Import them into ForgePSA and they\'ll auto-invoice on their next scheduled run.',
        breaks: 'Phantom invoices to customers who haven\'t been your customer in 4 years. Cleanup emails to accounts receivable. Trust erosion.',
        advanced: 'Even if you\'re sure a contract is dead, don\'t delete — mark it "expired" or "archived" with a reason. You want the history for the rare tax audit.',
      },
      {
        id: 'clean.custom_fields', title: 'Standardize custom fields before export',
        risk: 'medium', minutes: 30,
        why: 'Years of schema drift: "Industry", "industry", "Business Type" — all meaning the same thing. Consolidate before export, not after import.',
        breaks: 'Custom fields arrive as freetext noise. Reports that group by industry return 40 variants of "healthcare".',
      },
      {
        id: 'clean.large', title: 'Plan a batched import strategy',
        risk: 'medium', minutes: 30,
        why: 'For datasets over ~200 customers, one-shot imports strain the parser and make debugging impossible. Batch by region, tier, or alphabet.',
        breaks: 'A single failed row in a 2,000-row CSV cancels the whole batch.',
        filter: { tiers: ['mid', 'large'] },
      },
    ],
  },
  {
    id: 'setup',
    title: 'System Setup',
    subtitle: 'Stand up ForgePSA before you need it.',
    timing: '2 weeks before',
    icon: <Wrench className="h-5 w-5" />,
    tasks: [
      {
        id: 'setup.signup', title: 'Spin up your 45-day ForgePSA trial',
        risk: 'low', minutes: 5,
        why: 'No card, no sales call. Get your tenant provisioned today so you have 45 days of runway — not 45 days minus however long your eval committee takes.',
        breaks: 'Nothing — this is the safest step on the list.',
      },
      {
        id: 'setup.team', title: 'Add your techs + configure rates',
        risk: 'low', minutes: 30,
        why: 'Per-tech billable rates, per-client rate overrides, internal cost for margin math. Get this right on day one and it cascades into every invoice.',
        breaks: 'Wrong rates = wrong invoices for 30+ days before anyone notices.',
      },
      {
        id: 'setup.sso', title: 'Configure Google Workspace SSO',
        risk: 'low', minutes: 15,
        why: 'SSO means your offboarding story is "disable in Google → done". Without it, every tech departure is a manual rotation.',
        breaks: 'A week after a tech leaves, their forgotten local password is still valid.',
        advanced: 'Microsoft Entra SSO and SAML 2.0 are on the roadmap — for now, Google is the shipped path. If your shop is Microsoft-first, email us so we can prioritize.',
      },
      {
        id: 'setup.email', title: 'Configure tenant email (Gmail OAuth or SMTP)',
        risk: 'medium', minutes: 30,
        why: 'Email-to-ticket is how 60% of support tickets arrive. Get this wired early so you can test threading and filtering before cutover.',
        breaks: 'Inbound customer emails fall into the void during cutover week — the worst possible week for that to happen.',
      },
      {
        id: 'setup.mailjet', title: 'Wire Mailjet for billing emails',
        risk: 'low', minutes: 15,
        why: 'Separate channel for invoices, payment receipts, and statements. Keeps billing deliverability isolated from day-to-day email traffic.',
        breaks: 'Invoices end up in spam filters — which means invoices don\'t get paid.',
      },
      {
        id: 'setup.pax8', title: 'Connect Pax8',
        risk: 'low', minutes: 20,
        why: 'License sync, cost tracking, gross-margin reporting on every contract line. On every ForgePSA plan.',
        breaks: 'You lose margin visibility on M365, Acronis, and the dozen other Pax8 SKUs you resell.',
      },
      {
        id: 'setup.qbo', title: 'Wire QuickBooks Online (Pro plan)',
        risk: 'high', minutes: 60,
        why: 'Two-way sync of customers, invoices, and payments. The #1 thing to test before cutover week.',
        breaks: 'Broken QBO sync means manual reconciliation all month, plus every edge case you forgot about (voids, refunds, merged customers) has to be hand-fixed.',
        advanced: 'Map your QBO customer IDs to ForgePSA customers in a spreadsheet BEFORE running the first sync. It\'s 10x faster than un-merging later.',
      },
      {
        id: 'setup.stripe', title: 'Configure Stripe for customer payments',
        risk: 'low', minutes: 20,
        why: 'Pay-now links on every invoice. Get paid in 2 days instead of net-30.',
        breaks: 'Without Stripe, your AR stretches 30+ days and your bookkeeper hates you.',
      },
      {
        id: 'setup.ninja', title: 'Store NinjaOne credentials',
        risk: 'low', minutes: 15,
        why: 'Credentials storage is live today. Two-way device + patch + alert sync is the next shipped release — your tenant will pick it up automatically.',
        breaks: 'Nothing today, but storing credentials now means you\'re ready the moment sync lands.',
      },
      {
        id: 'setup.sla', title: 'Configure SLA policies to match your current tool',
        risk: 'medium', minutes: 45,
        why: 'Your customers know their response times. Don\'t change the clock under them.',
        breaks: 'A Platinum customer whose SLA silently widens from 1h to 4h will notice on their next escalation.',
      },
      {
        id: 'setup.statuses', title: 'Mirror ticket statuses + priorities',
        risk: 'low', minutes: 30,
        why: 'Techs shouldn\'t have to learn new status names during cutover week. Mirror your current vocabulary; refine later.',
        breaks: 'Tickets get reopened because "Resolved" in ForgePSA meant something different than "Resolved" in the old tool.',
      },
      {
        id: 'setup.end_to_end', title: 'Run a full end-to-end test',
        risk: 'high', minutes: 60,
        why: 'Test customer → test ticket → time entry → test contract → test invoice → test payment. If any step fails, the whole migration is a no-go.',
        breaks: 'You don\'t find the bug until real money is moving — and then it\'s a fire drill.',
      },
    ],
  },
  {
    id: 'exec',
    title: 'Migration Execution',
    subtitle: 'Export, map, import, validate.',
    timing: '1 week before — cutover week',
    icon: <PlayCircle className="h-5 w-5" />,
    tasks: [
      {
        id: 'exec.export_companies', title: 'Export companies from your current PSA',
        risk: 'medium', minutes: 30,
        why: 'Start with companies — everything else (contacts, tickets, contracts) joins on company IDs. Get this right first.',
        breaks: 'Orphaned records: contacts without a company, tickets without a customer.',
        advanced: 'From ConnectWise: Company → List View → Export all active companies. From Halo: Reports → Export Builder → Clients. From Syncro: Settings → Export → Customers.',
      },
      {
        id: 'exec.map_cw', title: 'Use the ConnectWise template for column mapping',
        risk: 'low', minutes: 15,
        why: 'ForgePSA\'s importer recognizes ConnectWise export headers automatically. One click and you\'re 90% of the way there.',
        breaks: 'Manual mapping for 30 columns invites typos.',
        filter: { psas: ['connectwise'] },
      },
      {
        id: 'exec.import_companies', title: 'Import companies + spot-check 20',
        risk: 'high', minutes: 60,
        why: 'Before importing anything else, validate that 20 random customers came in with the right address, phone, sites, and custom fields. If the sample\'s broken, stop and remap.',
        breaks: 'Discover the mapping error after importing 500 contacts tied to bad company IDs.',
      },
      {
        id: 'exec.export_contacts', title: 'Export and import contacts',
        risk: 'medium', minutes: 45,
        why: 'Contacts need to join to the correct company via the external ID you imported in the previous step.',
        breaks: 'Contact-to-company join fails silently → customer records show zero contacts.',
        advanced: 'Contact importer is rolling out — until it lands, you can bulk-create contacts via CSV through the customer detail API. Email us and we\'ll walk you through it.',
      },
      {
        id: 'exec.export_contracts', title: 'Export active contracts + line items',
        risk: 'high', minutes: 60,
        why: 'Contract imports drive recurring billing. Get this wrong and the first auto-invoicing run is a mess.',
        breaks: 'Missing line items → invoices go out missing $500 of line items per contract. Customer disputes. Credit memos.',
      },
      {
        id: 'exec.open_tickets', title: 'Import open tickets + reassign',
        risk: 'medium', minutes: 45,
        why: 'Only migrate OPEN tickets. Closed ones live in your old tool\'s archive forever — cheap insurance, no migration pain.',
        breaks: 'Migrating 10,000 closed tickets slows down every search in ForgePSA for no operational benefit.',
      },
      {
        id: 'exec.parallel_invoice', title: 'Run a parallel invoicing test',
        risk: 'high', minutes: 90,
        why: 'Generate next month\'s invoices in ForgePSA (dry run, don\'t send). Compare totals line-by-line against what the old tool would have generated. Mismatches surface here, not at cutover.',
        breaks: 'First real invoice run goes out $200 short to 40 customers. Week of fire-drill fixes.',
        advanced: 'Watch for tax jurisdictions, rounding differences on prorated line items, and per-customer rate overrides. These are the top-3 sources of invoice mismatches.',
      },
      {
        id: 'exec.freeze', title: 'Day 0: freeze writes in the old tool',
        risk: 'high', minutes: 15,
        why: 'Flip the old tool read-only. Prevents split-brain where new tickets are created in both places.',
        breaks: 'A single tech creates one ticket in the old tool on day 2 and you\'re manually reconciling for 3 months.',
      },
      {
        id: 'exec.delta', title: 'Day 0: import the last 24 hours of deltas',
        risk: 'medium', minutes: 30,
        why: 'Between your staging import and cutover, customers filed tickets. Catch those last-24h deltas so nothing drops.',
        breaks: 'A ticket filed at 9pm the night before cutover disappears if you only imported at 3pm.',
      },
      {
        id: 'exec.email_flip', title: 'Day 0: flip email-to-ticket routing',
        risk: 'high', minutes: 30,
        why: 'MX record change or forwarding rule. The moment the old inbox stops accepting, the new inbox needs to be accepting.',
        breaks: 'Inbound customer emails bounce for 2 hours. Support catastrophe.',
        advanced: 'Run forwarding for 7 days in parallel — cheap belt-and-suspenders.',
      },
    ],
  },
  {
    id: 'validate',
    title: 'Post-Migration Validation',
    subtitle: 'Prove the migration worked. Close the loop.',
    timing: '30 days after cutover',
    icon: <ClipboardCheck className="h-5 w-5" />,
    tasks: [
      {
        id: 'val.daily', title: 'Daily 15-min huddle for week 1',
        risk: 'low', minutes: 15,
        why: 'Migration owner + two senior techs, 15 minutes, same time every day. What\'s broken. What shipped. What changes tomorrow.',
        breaks: 'Issues surface in Slack, get missed, compound for a week.',
      },
      {
        id: 'val.invoices', title: 'Send week-1 invoices from ForgePSA',
        risk: 'high', minutes: 60,
        why: 'First real money flowing through the new tool. Cross-check totals against what the old tool would have generated (you did the dry run in Phase 4, right?).',
        breaks: 'Short invoices = chasing credit memos for a month.',
      },
      {
        id: 'val.payments', title: 'Reconcile payments received',
        risk: 'medium', minutes: 45,
        why: 'Week-1 payments should land in ForgePSA + Stripe + QBO with matching totals. Any three-way mismatch is a bug to chase.',
        breaks: 'Payments applied to wrong customers, or not applied at all. AR report turns to soup.',
      },
      {
        id: 'val.mrr', title: 'Full MRR reconciliation at day 14',
        risk: 'high', minutes: 120,
        why: 'ForgePSA MRR vs. old-tool MRR should match within a few percent. Bigger gap = missing contract or bad line items.',
        breaks: 'A 10% MRR gap means $10k/mo of contracts just silently disappeared.',
      },
      {
        id: 'val.retro', title: 'Run a 30-day retrospective',
        risk: 'low', minutes: 60,
        why: 'What went well, what broke, what surprised you. Write it down. Hand it to the next MSP doing this migration (or send it to us — we\'ll publish it on the blog).',
        breaks: 'You forget the hard-won lessons in 6 months.',
      },
      {
        id: 'val.cancel', title: 'Cancel old PSA write access; keep read-only 90 days',
        risk: 'medium', minutes: 20,
        why: 'Write access off kills split-brain risk. 90-day read-only is cheap insurance for historical reference.',
        breaks: 'Too-early full cancel = a week later you need to look up a resolved ticket from 2023 and can\'t.',
      },
      {
        id: 'val.archive', title: 'Full database export to cold storage',
        risk: 'medium', minutes: 60,
        why: 'Dump everything from the old tool to an S3 bucket, local NAS, wherever. Tax audits happen 3 years later. You want the data accessible.',
        breaks: 'IRS audit in 2028 and your old PSA vendor sunset their export tool in 2027.',
      },
    ],
  },
];

/* ─────────────────────── State helpers ─────────────────────── */

const STORAGE_KEY = 'forgepsa.migrationPlan.v1';

const defaultState = (): SavedState => ({
  personalization: { psa: '', techs: 0, customersBucket: '' },
  completed: {},
  expanded: {},
  advanced: {},
  activePhaseId: PHASES[0].id,
});

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function tierFromTechs(techs: number): Tier {
  if (techs <= 5) return 'small';
  if (techs <= 15) return 'mid';
  return 'large';
}

function applies(task: Task, p: Personalization): boolean {
  if (!task.filter) return true;
  if (task.filter.psas && p.psa && !task.filter.psas.includes(p.psa as SourcePSA)) return false;
  if (task.filter.tiers && p.techs > 0) {
    const tier = tierFromTechs(p.techs);
    if (!task.filter.tiers.includes(tier)) return false;
  }
  return true;
}

/* ─────────────────────── Page ─────────────────────── */

export function MigrationChecklist({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Migration Planner — ForgePSA',
    'An interactive migration planner for MSPs moving off ConnectWise, HaloPSA, Autotask, Syncro, or SuperOps. Phase-based, personalized, progress-tracked.',
  );

  const [state, setState] = useState<SavedState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const phaseRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // Filtered, personalized phase data
  const personalizedPhases = useMemo(() => (
    PHASES.map((ph) => ({
      ...ph,
      tasks: ph.tasks.filter((t) => applies(t, state.personalization)),
    }))
  ), [state.personalization]);

  const totals = useMemo(() => {
    let total = 0, done = 0, remainingMin = 0;
    personalizedPhases.forEach((ph) => {
      ph.tasks.forEach((t) => {
        total += 1;
        if (state.completed[t.id]) done += 1;
        else remainingMin += t.minutes;
      });
    });
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct, remainingMin };
  }, [personalizedPhases, state.completed]);

  const phaseTotals = useMemo(() => (
    personalizedPhases.map((ph) => {
      const total = ph.tasks.length;
      const done = ph.tasks.filter((t) => state.completed[t.id]).length;
      return { id: ph.id, total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
    })
  ), [personalizedPhases, state.completed]);

  const activePhase = personalizedPhases.find((p) => p.id === state.activePhaseId) ?? personalizedPhases[0];

  /* ─────────── Handlers ─────────── */

  const setPhase = (id: string) => {
    setState((s) => ({ ...s, activePhaseId: id }));
    setTimeout(() => {
      phaseRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  };

  const toggleTask = (id: string) => setState((s) => ({ ...s, completed: { ...s.completed, [id]: !s.completed[id] } }));
  const toggleExpand = (id: string) => setState((s) => ({ ...s, expanded: { ...s.expanded, [id]: !s.expanded[id] } }));
  const toggleAdvanced = (id: string) => setState((s) => ({ ...s, advanced: { ...s.advanced, [id]: !s.advanced[id] } }));

  const resetAll = () => {
    if (!confirm('Clear all progress and personalization? This cannot be undone.')) return;
    const fresh = defaultState();
    setState(fresh);
    saveState(fresh);
  };

  const planAsMarkdown = () => {
    const p = state.personalization;
    const header = [
      '# ForgePSA Migration Plan',
      '',
      `- **Source PSA:** ${p.psa || '(not specified)'}`,
      `- **Techs:** ${p.techs || '(not specified)'}`,
      `- **Customer size:** ${p.customersBucket || '(not specified)'}`,
      `- **Progress:** ${totals.done} / ${totals.total} (${totals.pct}%)`,
      '',
    ].join('\n');
    const body = personalizedPhases.map((ph) => {
      const lines = [
        `## ${ph.title} — ${ph.timing}`,
        `${ph.subtitle}`,
        '',
        ...ph.tasks.map((t) => {
          const done = state.completed[t.id] ? 'x' : ' ';
          return `- [${done}] **${t.title}** _(${t.minutes}m · ${t.risk} risk)_\n    - Why: ${t.why}\n    - Breaks: ${t.breaks}${t.advanced ? `\n    - Advanced: ${t.advanced}` : ''}`;
        }),
      ];
      return lines.join('\n');
    }).join('\n\n');
    return `${header}\n${body}\n`;
  };

  const exportPlan = () => {
    const md = planAsMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forgepsa-migration-plan.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendToTeam = () => {
    const md = planAsMarkdown();
    const body = encodeURIComponent(md.slice(0, 1800) + (md.length > 1800 ? '\n\n(Plan continues — full plan attached separately.)' : ''));
    window.location.href = `mailto:?subject=${encodeURIComponent('Our ForgePSA migration plan')}&body=${body}`;
  };

  if (!hydrated) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-500 dark:text-slate-400">Loading planner…</div>;
  }

  /* ─────────── Render ─────────── */

  return (
    <>
      {/* Sticky bottom CTA for mobile */}
      <MobileStickyCta navigate={navigate} pct={totals.pct} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-5 shadow-sm">
                <FileCheck2 className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                Interactive migration planner
              </div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                Plan your PSA migration like a product ship, not a blog post.
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                A phase-based planner that adapts to your current PSA and tech count, tracks progress across sessions,
                and exports a ready-to-share plan for your team.
              </p>
            </div>
            <div className="shrink-0 flex flex-wrap gap-2">
              <button
                onClick={exportPlan}
                className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" /> Export plan
              </button>
              <button
                onClick={sendToTeam}
                className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
              >
                <Mail className="h-4 w-4" /> Send to team
              </button>
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm px-3 py-2 rounded-lg"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Personalization + progress */}
      <section className="bg-white dark:bg-slate-950 border-y border-slate-200 dark:border-slate-800 sticky top-16 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 grid gap-4 lg:grid-cols-[1fr_auto] items-center">
          <PersonalizationBar
            value={state.personalization}
            onChange={(p) => setState((s) => ({ ...s, personalization: p }))}
          />
          <ProgressSummary pct={totals.pct} done={totals.done} total={totals.total} minutes={totals.remainingMin} />
        </div>
      </section>

      {/* Main content */}
      <section className="py-10 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* Phase navigator */}
          <aside className="lg:sticky lg:top-40 lg:self-start space-y-2">
            {personalizedPhases.map((ph, i) => {
              const pt = phaseTotals[i];
              const active = ph.id === state.activePhaseId;
              return (
                <button
                  key={ph.id}
                  onClick={() => setPhase(ph.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'border-brand-500 bg-white dark:bg-slate-800 shadow-sm ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                      pt.pct === 100
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : active
                        ? 'bg-brand-100 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {pt.pct === 100 ? <CheckCircle2 className="h-4 w-4" /> : ph.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Phase {i + 1}
                      </div>
                      <div className={`font-semibold truncate ${active ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                        {ph.title}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full transition-all ${pt.pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                            style={{ width: `${pt.pct}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                          {pt.done}/{pt.total}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Phase content */}
          <div className="space-y-8 min-w-0">
            {personalizedPhases.map((ph, i) => {
              const pt = phaseTotals[i];
              return (
                <div
                  key={ph.id}
                  ref={(el) => { phaseRefs.current[ph.id] = el; }}
                  className={`bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${
                    state.activePhaseId === ph.id ? 'ring-2 ring-brand-500/30' : ''
                  }`}
                >
                  <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1">
                          Phase {i + 1} · {ph.timing}
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{ph.title}</h2>
                        <p className="text-slate-600 dark:text-slate-300 mt-1">{ph.subtitle}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-3xl font-bold text-slate-900 dark:text-white">{pt.pct}%</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {pt.done} of {pt.total} done
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ph.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        done={!!state.completed[t.id]}
                        expanded={!!state.expanded[t.id]}
                        showAdvanced={!!state.advanced[t.id]}
                        onToggle={() => toggleTask(t.id)}
                        onExpand={() => toggleExpand(t.id)}
                        onAdvanced={() => toggleAdvanced(t.id)}
                      />
                    ))}
                    {ph.tasks.length === 0 && (
                      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No tasks for this phase given your personalization. Update the bar above.
                      </div>
                    )}
                  </div>

                  {/* Inter-phase CTA after phases 2 and 3 */}
                  {(ph.id === 'cleanup' || ph.id === 'setup') && (
                    <InlineCta
                      navigate={navigate}
                      phaseId={ph.id}
                      done={pt.pct === 100}
                    />
                  )}
                </div>
              );
            })}

            {/* Bottom CTA */}
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex items-start gap-4">
                <div className="hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 shrink-0">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-2">
                    Doing a real migration? We can walk it with you.
                  </h3>
                  <p className="text-brand-100 mb-5">
                    Book a 30-minute working session with someone who has done this migration
                    before. We\u2019ll review your plan, flag the risk items, and help scope the cutover week.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => navigate('/demo')}
                      className="bg-white hover:bg-slate-100 text-brand-700 font-bold px-6 py-2.5 rounded-lg shadow"
                    >
                      Book a guided migration
                    </button>
                    <button
                      onClick={() => navigate('/signup')}
                      className="bg-brand-700/40 hover:bg-brand-700/60 border border-brand-400/40 text-white font-semibold px-6 py-2.5 rounded-lg"
                    >
                      Start your 45-day trial
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─────────────────────── Subcomponents ─────────────────────── */

function PersonalizationBar({
  value, onChange,
}: { value: Personalization; onChange: (v: Personalization) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Settings2 className="h-3.5 w-3.5" /> Personalize
      </div>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-300">From</span>
        <select
          value={value.psa}
          onChange={(e) => onChange({ ...value, psa: e.target.value as SourcePSA | '' })}
          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm px-2 py-1.5 text-slate-900 dark:text-slate-100"
        >
          <option value="">Any PSA</option>
          <option value="connectwise">ConnectWise Manage</option>
          <option value="halopsa">HaloPSA</option>
          <option value="autotask">Autotask</option>
          <option value="syncro">Syncro</option>
          <option value="superops">SuperOps</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-300">Techs</span>
        <input
          type="number"
          min={0}
          max={500}
          value={value.techs || ''}
          onChange={(e) => onChange({ ...value, techs: Math.max(0, Number(e.target.value) || 0) })}
          placeholder="8"
          className="w-20 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm px-2 py-1.5 text-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-300">Customers</span>
        <select
          value={value.customersBucket}
          onChange={(e) => onChange({ ...value, customersBucket: e.target.value as Personalization['customersBucket'] })}
          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm px-2 py-1.5 text-slate-900 dark:text-slate-100"
        >
          <option value="">Any size</option>
          <option value="under_50">Under 50</option>
          <option value="50_200">50–200</option>
          <option value="200_plus">200+</option>
        </select>
      </label>
    </div>
  );
}

function ProgressSummary({ pct, done, total, minutes }: { pct: number; done: number; total: number; minutes: number }) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return (
    <div className="flex items-center gap-4 min-w-[240px]">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
          <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="none" className="text-slate-200 dark:text-slate-700" />
          <circle
            cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 94.248} 94.248`}
            className={pct === 100 ? 'text-emerald-500' : 'text-brand-500'}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white">
          {pct}%
        </div>
      </div>
      <div className="text-sm">
        <div className="font-semibold text-slate-900 dark:text-white">{done} of {total} tasks</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> ~{hours > 0 ? `${hours}h ` : ''}{mins}m remaining
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task, done, expanded, showAdvanced, onToggle, onExpand, onAdvanced,
}: {
  task: Task; done: boolean; expanded: boolean; showAdvanced: boolean;
  onToggle: () => void; onExpand: () => void; onAdvanced: () => void;
}) {
  return (
    <div className={`group ${done ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}>
      <div className="flex items-start gap-3 p-5">
        <button
          onClick={onToggle}
          className="shrink-0 mt-0.5"
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        >
          {done
            ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            : <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-brand-500" />}
        </button>
        <button
          onClick={onExpand}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${done ? 'text-slate-500 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
              {task.title}
            </span>
            <RiskChip risk={task.risk} />
            <TimeChip minutes={task.minutes} />
          </div>
        </button>
        <button
          onClick={onExpand}
          className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
      {expanded && (
        <div className="px-5 pb-5 pl-[60px] space-y-3 text-sm">
          <Field label="Why it matters" body={task.why} />
          <Field label="What can break" body={task.breaks} variant="warn" />
          {task.advanced && (
            <div>
              <button
                onClick={onAdvanced}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Advanced notes
              </button>
              {showAdvanced && (
                <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  {task.advanced}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onToggle}
            className={`inline-flex items-center gap-2 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors ${
              done
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-brand-600 hover:bg-brand-700 text-white'
            }`}
          >
            {done ? <><CheckCircle2 className="h-3.5 w-3.5" /> Done — click to undo</> : <>Mark complete</>}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, body, variant }: { label: string; body: string; variant?: 'warn' }) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
        variant === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
      }`}>{label}</div>
      <div className="text-slate-700 dark:text-slate-300 leading-relaxed">{body}</div>
    </div>
  );
}

function RiskChip({ risk }: { risk: Risk }) {
  const styles = {
    low: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    medium: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    high: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300',
  }[risk];
  const label = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' }[risk];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${styles}`}>
      {risk === 'high' && <ShieldAlert className="h-3 w-3" />}
      {risk === 'medium' && <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function TimeChip({ minutes }: { minutes: number }) {
  const label = minutes >= 60 ? `~${Math.round(minutes / 60)}h` : `~${minutes}m`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      <Clock className="h-3 w-3" /> {label}
    </span>
  );
}

function InlineCta({ navigate, phaseId, done }: { navigate: (p: string) => void; phaseId: string; done: boolean }) {
  const copy = phaseId === 'cleanup'
    ? {
        title: 'Data looks cleaner already. Spin up your trial next.',
        desc: 'Your next phase is System Setup inside ForgePSA. Start your trial now and your progress here syncs right through the setup.',
      }
    : {
        title: 'Tenant stood up? Nice. One step closer to cutover.',
        desc: 'Importing in Phase 4 needs a live tenant. Make sure yours is ready — and your team has logged in at least once.',
      };
  return (
    <div className={`p-5 border-t ${done
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20'
      : 'border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/20'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{copy.title}</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{copy.desc}</p>
        </div>
        <button
          onClick={() => navigate('/signup')}
          className="shrink-0 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-lg shadow"
        >
          Start free trial <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MobileStickyCta({ navigate, pct }: { navigate: (p: string) => void; pct: number }) {
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 shadow-lg">
      <div className="text-xs min-w-0">
        <div className="font-semibold text-slate-900 dark:text-white truncate">{pct}% complete</div>
        <div className="text-slate-500 dark:text-slate-400 truncate">Your plan auto-saves</div>
      </div>
      <button
        onClick={() => navigate('/signup')}
        className="ml-auto inline-flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs px-3 py-2 rounded-lg shadow whitespace-nowrap"
      >
        Start trial <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
