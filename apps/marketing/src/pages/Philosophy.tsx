import { Flame, ThumbsDown, ThumbsUp, Compass } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Philosophy({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Philosophy — Why ForgePSA exists',
    'ForgePSA was built by an operator who ran an MSP on HaloPSA, ConnectWise, and Syncro. Here\'s what we refuse to do and what we\'ll always do.',
  );
  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <Flame className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Why we built this
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            We built the PSA we couldn't buy.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            ForgePSA exists because every PSA we tried — Halo, ConnectWise, Autotask, Syncro — made a trade-off we weren't willing to live with.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate dark:prose-invert max-w-none space-y-6 text-slate-700 dark:text-slate-200 leading-relaxed">
          <p>
            I run an MSP. Before building ForgePSA, I ran my own business on three different PSAs.
            Every one of them worked — and every one of them drove me, and my techs, up a wall.
          </p>
          <p>
            The legacy tools (Halo, ConnectWise) are staggeringly capable, but getting a junior tech
            productive on one takes a week of training. Changing a ticket status requires a consultant.
            Pricing is a maze — the feature you want is always one tier up.
          </p>
          <p>
            The newer all-in-ones (Syncro, SuperOps) are cleaner, but they lock you into their RMM.
            We already had NinjaRMM. It's the best RMM we've used. We weren't going to rip it out to
            get a nicer ticket screen.
          </p>
          <p>
            So we built the middle path. A modern PSA that plays nicely with NinjaRMM (and the other
            RMMs MSPs actually use, coming soon). One price. All integrations. A real trial long
            enough to run a billing cycle through. No sales call required.
          </p>
        </div>
      </section>

      {/* What we refuse to do */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
              <ThumbsDown className="h-6 w-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              What we refuse to do
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Principle
              title="Sell your data. Ever."
              desc="Not to advertisers, not to brokers, not to anyone. This isn't a policy we reserve the right to change — it's in our Terms of Service with 30 days' notice required for material changes."
            />
            <Principle
              title="Train AI models on your tickets."
              desc="Customer data does not train AI models. Period. Our AI features use prompts that are redacted before sending and responses that are not retained for training."
            />
            <Principle
              title="Gate integrations behind the top tier."
              desc="Every integration works on every plan. QuickBooks, Pax8, Stripe, ConnectBooster, CrewHu, Twilio — all included."
            />
            <Principle
              title="Force a sales call to try the product."
              desc="If you can't evaluate a PSA without a demo, the product isn't good enough. Sign up, run a billing cycle, decide. No salesperson required."
            />
            <Principle
              title="Lock you in with your own data."
              desc="Export anything, any time. JSON, CSV, API. If you leave, you leave with everything. Data portability is a default, not a concession."
            />
            <Principle
              title="Add 'AI' to a button for the sake of it."
              desc="AI is useful when it saves a tech five minutes. It's a distraction when it's glitter sprinkled on every screen. We ship AI features that pass our own dog-food test, and nothing else."
            />
          </div>
        </div>
      </section>

      {/* What we'll always do */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
              <ThumbsUp className="h-6 w-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              What we'll always do
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Principle positive
              title="Ship every week."
              desc="Our changelog updates weekly. You can see exactly what we shipped and why. No quarterly roadmap theater."
            />
            <Principle positive
              title="Lock your launch price for life."
              desc="If you sign up during our launch window, your price is your price. We will not retroactively raise it on you."
            />
            <Principle positive
              title="Treat your data as yours."
              desc="Tenant-isolated at every query, encrypted credentials per tenant, full audit log, export on demand. Your data never leaves your tenant except to integrations you've explicitly enabled."
            />
            <Principle positive
              title="Tell you when we're the wrong choice."
              desc="We have /compare pages that say when HaloPSA is the right call, when ConnectWise should stay, when Syncro fits better. Honest fit matters more than a sale."
            />
            <Principle positive
              title="Listen to operators, not committees."
              desc="Every feature request gets read. The ones that change how MSPs actually work get built. The ones that don't, don't — no matter how loud the RFP."
            />
            <Principle positive
              title="Keep pricing simple."
              desc="One price per tech. No per-integration fees. No implementation fees. No per-customer fees. No surprise uplifts at renewal."
            />
          </div>
        </div>
      </section>

      {/* Direction */}
      <section className="py-20 bg-slate-950 text-white border-y border-slate-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-900/40 text-brand-400">
              <Compass className="h-6 w-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">
              Where we're headed
            </h2>
          </div>
          <ul className="space-y-3 text-slate-300">
            <li><strong className="text-white">More RMM integrations.</strong> Datto RMM, Atera, N-able N-central — on the roadmap.</li>
            <li><strong className="text-white">Deeper automation.</strong> Multi-step workflow builder for ticket routing, contract SLAs, and customer lifecycle events.</li>
            <li><strong className="text-white">Native mobile apps.</strong> iOS and Android apps for techs on the road.</li>
            <li><strong className="text-white">Vendor management.</strong> Purchase orders, vendor contracts, and reseller margin tracking — not just Pax8.</li>
            <li><strong className="text-white">Reporting that doesn't require a SQL query.</strong> Custom dashboards, scheduled email reports, margin trends.</li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Sound like the PSA you wish you had?
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
            Try it for 45 days. Keep your RMM. Keep your data. See if we're the real deal.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
          >
            Start 45-day free trial
          </button>
        </div>
      </section>
    </>
  );
}

function Principle({ title, desc, positive }: { title: string; desc: string; positive?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${
      positive
        ? 'border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
    }`}>
      <div className="font-semibold text-slate-900 dark:text-white mb-1">{title}</div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{desc}</p>
    </div>
  );
}
