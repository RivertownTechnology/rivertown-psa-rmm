import { GitCommit, Sparkles, Bug, Zap } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

type EntryType = 'feature' | 'improvement' | 'fix';
type Entry = { title: string; desc: string; type: EntryType };
type Release = { date: string; version: string; entries: Entry[] };

const releases: Release[] = [
  {
    date: 'April 12, 2026',
    version: '2026.04.3',
    entries: [
      { type: 'feature', title: 'ConnectWise-format companies importer', desc: 'Settings → Import now accepts ConnectWise-format company exports with auto-detected column mappings. Contacts, contracts, and tickets importers are up next.' },
      { type: 'feature', title: 'Launch pricing — $29/$49/tech', desc: 'Locked in for life for anyone who signs up during launch.' },
      { type: 'feature', title: 'Comparison pages', desc: 'We published honest side-by-side comparisons to HaloPSA, ConnectWise, Syncro, SuperOps, and NinjaOne.' },
      { type: 'improvement', title: 'Marketing site dark mode', desc: 'Auto-detects system preference with a manual toggle in the header. Dark-mode contrast pass across every page.' },
      { type: 'improvement', title: 'AI prompt-injection hardening', desc: 'Ticket content is wrapped in delimiters before being sent to Claude so untrusted user text can\'t override our instructions.' },
    ],
  },
  {
    date: 'April 5, 2026',
    version: '2026.04.2',
    entries: [
      { type: 'feature', title: 'Super-admin impersonation', desc: 'ForgePSA-Admin can log into any tenant as an admin for support escalations. Every session is audit-logged and time-boxed.' },
      { type: 'feature', title: 'Tenant-level email provider', desc: 'Choose Mailjet, SMTP, or Gmail OAuth per tenant. Billing emails respect the tenant\'s branding.' },
      { type: 'fix', title: 'Invoice PDF line-total rounding', desc: 'One-cent discrepancies caused by floating-point math on tax-inclusive invoices are gone.' },
    ],
  },
  {
    date: 'March 29, 2026',
    version: '2026.03.5',
    entries: [
      { type: 'feature', title: 'Stripe subscription billing', desc: 'Native in-app subscription management — no redirect to the Stripe customer portal. Add a card, change plans, view invoices, cancel, resume.' },
      { type: 'feature', title: 'Pax8 margin tracking', desc: 'Gross-margin columns on every contract line item sourced from a Pax8 product. Included on every plan.' },
      { type: 'improvement', title: 'Ticket keyboard shortcuts', desc: 'R to reply, N for internal note, S to change status, A to assign, T to start/stop timer.' },
    ],
  },
  {
    date: 'March 22, 2026',
    version: '2026.03.4',
    entries: [
      { type: 'feature', title: 'SLA policies with response + resolution timers', desc: 'Assign a contract SLA to a ticket and the clocks run. Breach-behaviour escalations are shipping next.' },
      { type: 'improvement', title: 'Customer portal passkeys', desc: 'WebAuthn login for portal users. No more password resets.' },
      { type: 'fix', title: 'QuickBooks Online sync edge cases', desc: 'Merged customers, voided invoices, and partial refunds now round-trip correctly.' },
    ],
  },
  {
    date: 'March 15, 2026',
    version: '2026.03.3',
    entries: [
      { type: 'feature', title: 'NinjaOne credential storage + settings UI', desc: 'Settings → Integrations → NinjaOne accepts your API client ID/secret and region. Two-way device, patch, and alert sync is next on the roadmap.' },
      { type: 'feature', title: 'Customer portal white-label (logo + colors)', desc: 'Custom logo and brand colors applied across the portal. Custom portal subdomain is still in flight.' },
      { type: 'improvement', title: '45-day trial (up from 30)', desc: 'Because 14 days isn\'t enough to run a billing cycle. Neither was 30.' },
    ],
  },
];

const iconFor = (t: EntryType) => t === 'feature' ? <Sparkles className="h-4 w-4" /> : t === 'fix' ? <Bug className="h-4 w-4" /> : <Zap className="h-4 w-4" />;
const labelFor = (t: EntryType) => t === 'feature' ? 'New' : t === 'fix' ? 'Fix' : 'Improved';
const colorFor = (t: EntryType) =>
  t === 'feature' ? 'bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800'
  : t === 'fix' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';

export function Changelog({ navigate: _navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Changelog — ForgePSA',
    'Everything we\'ve shipped recently. ForgePSA publishes its weekly changelog in public.',
  );
  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <GitCommit className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Shipping every week
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            Changelog.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            Features, improvements, and fixes — published in public. No quarterly roadmap theater.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <ol className="relative space-y-10 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
            {releases.map((rel) => (
              <li key={rel.version} className="relative pl-10">
                <div className="absolute left-0 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-500 bg-white dark:bg-slate-950 text-brand-600 dark:text-brand-400">
                  <GitCommit className="h-3 w-3" />
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
                  <div className="text-lg font-bold text-slate-900 dark:text-white">{rel.date}</div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{rel.version}</div>
                </div>
                <ul className="space-y-3">
                  {rel.entries.map((e, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className={`inline-flex items-center gap-1 shrink-0 mt-0.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${colorFor(e.type)}`}>
                        {iconFor(e.type)} {labelFor(e.type)}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{e.title}</div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{e.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Want to shape what we ship next?</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-5">
            Every customer email goes to a human. Product requests get logged, triaged, and often shipped within the month.
          </p>
          <a
            href="mailto:hello@forgepsa.com"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow"
          >
            Email us a feature request
          </a>
        </div>
      </section>
    </>
  );
}
