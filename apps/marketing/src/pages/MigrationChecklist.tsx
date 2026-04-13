import { useState } from 'react';
import { FileCheck2, Calendar, Database, Users, FileText, ClipboardList, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function MigrationChecklist({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'PSA Migration Checklist — ForgePSA',
    'The field-tested checklist for migrating off ConnectWise, HaloPSA, Autotask, or Syncro. Export, import, parallel run, and cutover — without losing data or billing cycles.',
  );

  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function signup(e: React.FormEvent) {
    e.preventDefault();
    // Client-side only — hands off to hello@forgepsa.com. Replace with API when ready.
    window.location.href = `mailto:hello@forgepsa.com?subject=${encodeURIComponent(
      'Add me to the migration checklist list',
    )}&body=${encodeURIComponent(`Email: ${email}`)}`;
    setSubscribed(true);
  }

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <FileCheck2 className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Free guide
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            The PSA migration checklist.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            The field-tested playbook for moving off ConnectWise, HaloPSA, Autotask, or Syncro —
            without losing data or missing a billing cycle.
          </p>
        </div>
      </section>

      {/* Checklist */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">

          <Stage
            icon={<Calendar />}
            stage="Stage 1"
            title="4 weeks before cutover"
            items={[
              'Pick a cutover date — month boundary, mid-week, not during a client-critical project',
              'Identify your migration owner (1 person, 4–6 weeks, at least 30% of their time)',
              'Inventory your current PSA: how many companies, contacts, open tickets, active contracts, unpaid invoices',
              'Audit your integrations: which will move, which will be replaced, which will go away',
              'Document your current ticket workflow (statuses, priorities, escalation rules) — you will recreate this',
              'Screenshot every custom report you rely on',
            ]}
          />

          <Stage
            icon={<Database />}
            stage="Stage 2"
            title="3 weeks before"
            items={[
              'Sign up for ForgePSA\'s 45-day trial (no card, no sales call)',
              'Create your tenant, add your team, configure SSO (Microsoft Entra or Google)',
              'Set up your integrations: NinjaRMM, QuickBooks, Pax8, Stripe, Mailjet',
              'Configure ticket statuses, priorities, and default SLA policies to match your current tool',
              'Create your first test customer, test ticket, test contract, test invoice end-to-end',
              'Generate a test invoice → send it to a real email → verify it renders + pays correctly',
            ]}
          />

          <Stage
            icon={<Users />}
            stage="Stage 3"
            title="2 weeks before — data export"
            items={[
              'Export from the old PSA in this order: Companies → Sites → Contacts',
              'Export active contracts (not historical)',
              'Export open tickets only at this stage',
              'Export your product catalog / agreements templates',
              'Export billable time entries for the current month-in-progress',
              'Keep a full-database backup — treat the old tenant as cold storage',
            ]}
          />

          <Stage
            icon={<FileText />}
            stage="Stage 4"
            title="1 week before — import + validate"
            items={[
              'Upload CSVs via Settings → Import (ForgePSA accepts ConnectWise-format exports natively)',
              'Spot-check 20 imported customers: do sites, contacts, and custom fields match?',
              'Spot-check imported contracts: line items, rates, next bill date all correct?',
              'Load open tickets. Reassign to the right tech. Set correct status + SLA tier',
              'Run a trial batch of invoices against imported contracts — cross-check totals vs old tool',
              'Brief your techs: at the end-of-week meeting, hand out cheat sheets',
            ]}
          />

          <Stage
            icon={<ClipboardList />}
            stage="Stage 5"
            title="Cutover week"
            items={[
              'Day 1: freeze new tickets, contracts, and invoices in the old tool (read-only)',
              'Day 1: import the last 24 hours of data deltas',
              'Day 1: flip email-to-ticket routing to ForgePSA (MX change or forwarding rule)',
              'Day 2–5: daily stand-up with the migration owner + 2 senior techs, 15 minutes, what\'s broken',
              'Day 5: send the week\'s invoices from ForgePSA (parallel with old tool is fine)',
              'Day 5: verify all payments received — match against old-tool payment reports',
            ]}
          />

          <Stage
            icon={<ShieldCheck />}
            stage="Stage 6"
            title="30 days after cutover"
            items={[
              'Close the loop: all historical tickets either imported or archived with a one-liner linking to their old-tool record',
              'Cancel any integrations that are no longer pointed at the old tool',
              'Run a full reporting reconciliation: MRR, AR, backlog, utilization — numbers should match the old tool within a few percent',
              'Cancel the old PSA\'s write access (keep read-only for 90 days)',
              'Full database export of the old tool to cold storage (S3, local NAS, anywhere offline)',
              'Celebrate. You just did the hardest infrastructure project of the year.',
            ]}
          />
        </div>
      </section>

      {/* Email capture */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Want this as a printable PDF?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Drop your email and we'll send the PDF version plus a short migration email series —
            one per stage, no spam, unsubscribe any time.
          </p>
          {subscribed ? (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-start gap-3 text-left">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Email draft opened.</div>
                <div>We'll send the PDF + email series within one business day.</div>
              </div>
            </div>
          ) : (
            <form onSubmit={signup} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourmsp.com"
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow"
              >
                Send me the PDF
              </button>
            </form>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Doing a real migration? We can help.
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            ForgePSA's CSV importer handles ConnectWise-format exports out of the box. If you\'re on HaloPSA,
            Autotask, or Syncro, email us with a sample export and we\'ll walk the mapping.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
            >
              Start 45-day free trial
            </button>
            <a
              href="mailto:hello@forgepsa.com?subject=Migration%20help"
              className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Email the migration team
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function Stage({
  icon, stage, title, items,
}: {
  icon: React.ReactNode; stage: string; title: string; items: string[];
}) {
  return (
    <div className="border-l-4 border-brand-500 pl-6 py-2">
      <div className="flex items-center gap-3 mb-1">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
          {icon}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">{stage}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">{title}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
