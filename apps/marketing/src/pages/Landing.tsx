import {
  Ticket, Receipt, Users, Package, Zap, Sparkles,
  AlertTriangle, Clock, Check, X as XIcon, ArrowRight,
  Cpu, Workflow, Eye,
} from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Landing({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'ForgePSA — The PSA that doesn\'t make you switch RMMs',
    'Modern PSA for MSPs. Keep NinjaRMM. Every integration included on every plan. 45-day trial, no credit card. Built by an MSP, for MSPs.',
  );
  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute top-20 -left-20 w-72 h-72 rounded-full bg-brand-200 dark:bg-brand-800 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-cyan-200 dark:bg-cyan-900 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 lg:pt-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              Built by an MSP, for MSPs
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white mb-6">
              The PSA that doesn't make you{' '}
              <span className="text-brand-600 dark:text-brand-400">switch RMMs</span>.
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
              Modern ticketing, contracts, billing, and a customer portal — priced per tech, with every
              integration included. Keep NinjaRMM. Keep your data. Actually try it for 45 days.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/signup')}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
              >
                Start 45-day free trial
              </button>
              <button
                onClick={() => navigate('/compare')}
                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Compare us to HaloPSA, ConnectWise &amp; more
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
              No credit card · Full feature access · Launch pricing locked in for life
            </p>
          </div>

          {/* Hero screenshot */}
          <div className="relative mt-12 lg:mt-16 max-w-6xl mx-auto">
            <div className="relative rounded-xl bg-gradient-to-br from-brand-100 to-cyan-100 dark:from-brand-900/30 dark:to-cyan-900/30 p-2 shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10">
              <img
                src="/screenshots/dashboardwallwidgets.png"
                alt="ForgePSA dashboard with operational widgets"
                loading="eager"
                className="rounded-lg w-full h-auto block border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white dark:from-slate-950 to-transparent rounded-b-xl pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ───────── Problem ───────── */}
      <section className="py-20 bg-white dark:bg-slate-950 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 mb-3">
              <AlertTriangle className="h-4 w-4" />
              The problem
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Your PSA shouldn't be the reason techs quit.
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Legacy PSAs were designed for 10-person IT departments in 2009, sold to enterprises,
              and somehow ended up running your MSP. It shows.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <ProblemCard
              title="It's 2026, and your PSA still looks like Outlook 2007."
              desc="HaloPSA, ConnectWise, Autotask — powerful, but you need a consultant to change a ticket status. Techs work around it instead of in it."
            />
            <ProblemCard
              title="Every integration is behind the top tier."
              desc="QuickBooks? Top tier. SSO? Top tier. Reporting? Top tier. Either pay $85/seat or export CSVs at month-end and reconcile by hand."
            />
            <ProblemCard
              title="'Free trial' means 14 days and a sales call."
              desc="You can't evaluate a PSA without running a full billing cycle. Most trials end before you've onboarded the first customer. Ours is 45 days, no card, no call."
            />
          </div>
        </div>
      </section>

      {/* ───────── Solution ───────── */}
      <section className="py-24 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 mb-3">
              <Zap className="h-4 w-4" />
              The approach
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              One PSA. Every integration. Every plan.
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              No feature gating by plan. No sales-led integration unlocks. The only thing that
              changes as you grow is how many techs you have.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <SolutionCard
              icon={<Ticket />}
              title="Tickets & SLAs"
              desc="Service desk built for techs. Email-to-ticket, AI reply drafts (opt-in), SLA timers, saved filters, keyboard-first."
            />
            <SolutionCard
              icon={<Receipt />}
              title="Contracts & invoicing"
              desc="Block hours, recurring services, flat-rate, per-user, per-device. Auto-invoicing, Stripe + QBO + ConnectBooster."
            />
            <SolutionCard
              icon={<Users />}
              title="Customer portal"
              desc="Passkey login, ticket submission, invoice pay, quote approval. Fully white-labeled — your logo, your colors."
            />
            <SolutionCard
              icon={<Package />}
              title="Catalog with real margins"
              desc="Pax8 license sync with true cost tracking. Gross margin visible on every contract and invoice line."
            />
          </div>
        </div>
      </section>

      {/* ───────── Comparison band ───────── */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 mb-3">
              <Eye className="h-4 w-4" />
              The comparison
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Modern, honest, affordable — pick three.
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              A quick read against the tools MSPs evaluate most often. The full breakdown lives on each comparison page.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900 dark:text-white min-w-[180px]">vs. competitors</th>
                  <th className="text-center px-3 py-3 font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40">ForgePSA</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-900 dark:text-white">HaloPSA</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-900 dark:text-white">ConnectWise</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-900 dark:text-white">Syncro</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-900 dark:text-white">SuperOps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                <CompareRow
                  label="Starting price / tech / mo"
                  values={['$29', '$85+', '$75+', '$139 flat', '$79+']}
                  highlight
                />
                <CompareRow
                  label="Free trial length"
                  values={['45 days', '30 days*', 'Sales call', '14 days', '21 days']}
                />
                <CompareRow
                  label="No credit card required"
                  values={[true, false, false, true, false]}
                />
                <CompareRow
                  label="Bring your own RMM"
                  values={[true, true, true, false, false]}
                />
                <CompareRow
                  label="All integrations on every plan"
                  values={[true, false, false, 'Most', false]}
                />
                <CompareRow
                  label="Built on a 2020s stack"
                  values={[true, false, false, true, true]}
                />
                <CompareRow
                  label="Typical onboarding time"
                  values={['< 1 day', '4-8 weeks', '6-12 weeks', '1-2 weeks', '1-2 weeks']}
                />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">
            Pricing reflects each vendor's published starting tier as of April 2026. We'll update this page as they change.
          </p>

          <div className="text-center mt-10">
            <button
              onClick={() => navigate('/compare')}
              className="inline-flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-semibold"
            >
              See the full comparisons <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ───────── Automation strip ───────── */}
      <section className="py-24 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 mb-3">
                <Workflow className="h-4 w-4" />
                Automation, done right
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Practical automation. Not AI theater.
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 mb-6">
                We built AI features because techs asked for them — not because a marketing team decided
                every button needed a sparkle icon.
              </p>
              <ul className="space-y-4">
                <AutomationRow
                  icon={<Sparkles />}
                  title="AI reply drafts, with credentials redacted first"
                  desc="Secrets (passwords, keys, tokens) are stripped from the ticket before it ever leaves your tenant. You keep the draft. You ship it."
                />
                <AutomationRow
                  icon={<Cpu />}
                  title="Auto-route by contract, priority, or SLA"
                  desc="New ticket from a Platinum-tier contract? Routed, SLA'd, and assigned before a human looks at it."
                />
                <AutomationRow
                  icon={<Clock />}
                  title="Billable time rolls up automatically"
                  desc="Timers flow directly to the next invoice. No spreadsheet reconciliation at month-end."
                />
              </ul>
            </div>
            <div className="relative rounded-2xl bg-gradient-to-br from-brand-100 to-cyan-100 dark:from-brand-950/40 dark:to-cyan-950/40 p-3 shadow-xl ring-1 ring-slate-900/10 dark:ring-white/10">
              <img
                src="/screenshots/ticket-ticket-view.png"
                alt="Ticket view with timers, SLA, and AI reply draft"
                loading="lazy"
                className="rounded-lg w-full h-auto block border border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Integrations band ───────── */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Plays nicely with the tools you already pay for.
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Every integration below works on every plan. Encrypted credentials per tenant, OAuth where possible.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              'NinjaRMM', 'Pax8', 'QuickBooks', 'Stripe', 'ConnectBooster',
              'CrewHu', 'Twilio', 'Microsoft Entra', 'Google Workspace', 'Anthropic',
            ].map((name) => (
              <div
                key={name}
                className="flex items-center justify-center px-4 py-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                {name}
              </div>
            ))}
          </div>
          <div className="mt-8">
            <button
              onClick={() => navigate('/features')}
              className="inline-flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-semibold text-sm"
            >
              See every integration <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ───────── Social proof placeholder ───────── */}
      <section className="py-24 bg-slate-950 text-white border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built with feedback from operators running real books of business.
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              We ship weekly. Every feature is shaped by MSPs in the field — not design committees.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <TestimonialPlaceholder
              quote="Your quote lives here."
              attribution="MSP Owner, 12 techs"
            />
            <TestimonialPlaceholder
              quote="Your quote lives here."
              attribution="Operations Lead, 6 techs"
            />
            <TestimonialPlaceholder
              quote="Your quote lives here."
              attribution="MSP Owner, 22 techs"
            />
          </div>
          <p className="text-center text-sm text-slate-400 mt-8">
            Running a trial? Willing to go on the record?{' '}
            <a href="mailto:hello@forgepsa.com" className="text-brand-400 hover:text-brand-300 underline">
              We'd love to hear from you.
            </a>
          </p>
        </div>
      </section>

      {/* ───────── Pricing teaser ───────── */}
      <section className="py-24 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Simple, transparent pricing.
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-2">
            Starts at $29/tech/month. All features. All integrations. No sales call required.
          </p>
          <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded-full px-3 py-1 text-xs font-semibold mb-10">
            🎉 Launch pricing — locked in for life
          </div>

          <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto mb-10">
            <PricingSummary name="Starter" price="$29" originalPrice="$49" desc="Solo operators + small teams (1–3 techs)" />
            <PricingSummary name="Pro" price="$49" originalPrice="$79" featured desc="Growing MSPs (4–15 techs)" />
            <PricingSummary name="Enterprise" price="Custom" desc="16+ techs, dedicated instance" />
          </div>

          <button
            onClick={() => navigate('/pricing')}
            className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-semibold"
          >
            See full pricing comparison →
          </button>
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl px-8 py-16 text-white shadow-2xl shadow-brand-600/30">
            <Zap className="h-12 w-12 text-white mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Stop paying more for less.
            </h2>
            <p className="text-xl text-brand-100 mb-8 max-w-2xl mx-auto">
              45 days, full product, no card. Enough time to actually decide.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/signup')}
                className="bg-white hover:bg-slate-100 text-brand-700 font-bold px-8 py-3 rounded-lg transition-colors shadow-lg"
              >
                Start your free trial
              </button>
              <button
                onClick={() => navigate('/demo')}
                className="bg-brand-700/50 hover:bg-brand-700/70 border border-brand-400/40 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Book a 20-minute demo
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ──────────── subcomponents ──────────── */

function ProblemCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 mb-4">
        <XIcon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{desc}</p>
    </div>
  );
}

function SolutionCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-lg hover:border-brand-200 dark:hover:border-brand-700 transition-all">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 mb-4 group-hover:bg-brand-600 group-hover:text-white dark:group-hover:bg-brand-600 dark:group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{desc}</p>
    </div>
  );
}

function CompareRow({ label, values, highlight }: { label: string; values: (string | boolean)[]; highlight?: boolean }) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{label}</td>
      {values.map((v, i) => {
        const isForge = i === 0;
        const cellClass = `px-3 py-3 text-center ${isForge ? 'bg-brand-50/50 dark:bg-brand-950/30' : ''}`;
        if (typeof v === 'boolean') {
          return (
            <td key={i} className={cellClass}>
              {v
                ? <Check className="h-4 w-4 text-brand-600 dark:text-brand-400 inline" />
                : <XIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 inline" />}
            </td>
          );
        }
        return (
          <td
            key={i}
            className={`${cellClass} text-sm ${highlight && isForge ? 'font-bold text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}
          >
            {v}
          </td>
        );
      })}
    </tr>
  );
}

function AutomationRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-slate-900 dark:text-white mb-1">{title}</div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{desc}</div>
      </div>
    </li>
  );
}

function TestimonialPlaceholder({ quote, attribution }: { quote: string; attribution: string }) {
  return (
    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur">
      <div className="text-lg text-slate-200 mb-4 italic">"{quote}"</div>
      <div className="text-sm text-slate-400">— {attribution}</div>
    </div>
  );
}

function PricingSummary({ name, price, originalPrice, desc, featured }: { name: string; price: string; originalPrice?: string; desc: string; featured?: boolean }) {
  return (
    <div className={`rounded-2xl p-6 border ${
      featured
        ? 'bg-brand-600 text-white border-brand-600 shadow-xl scale-105'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }`}>
      <div className={`text-sm font-semibold mb-1 ${featured ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{name}</div>
      <div className="flex items-baseline justify-center gap-2 mb-1 flex-wrap">
        {originalPrice && (
          <div className={`text-xl font-bold line-through ${
            featured ? 'text-brand-200' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {originalPrice}
          </div>
        )}
        <div className={`text-3xl font-bold ${featured ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{price}</div>
      </div>
      <div className={`text-sm mb-3 ${featured ? 'text-brand-100' : 'text-slate-600 dark:text-slate-300'}`}>per tech/month</div>
      <div className={`text-xs ${featured ? 'text-brand-50' : 'text-slate-500 dark:text-slate-400'}`}>{desc}</div>
    </div>
  );
}

