import {
  Ticket, Receipt, Users, Clock, BarChart3, Zap,
  Shield, Sparkles, Package, DollarSign, Mail, Check,
} from 'lucide-react';

export function Landing({ navigate }: { navigate: (p: string) => void }) {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-slate-50" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 -left-20 w-72 h-72 rounded-full bg-brand-200 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-cyan-200 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 lg:pt-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700 mb-6 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-brand-600" />
              Built by an MSP, for MSPs
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
              The all-in-one platform your <span className="text-brand-600">MSP</span> has been waiting for.
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              PSA, RMM, billing, quotes, customer portal, and smart automation — all in one tool. Replace 5 legacy systems and cut your monthly software bill in half.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/signup')}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
              >
                Start 45-day free trial
              </button>
              <button
                onClick={() => navigate('/features')}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                See how it works
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-4">No credit card required · Cancel anytime · Full access during trial</p>
          </div>

          {/* Hero screenshot — main dashboard */}
          <div className="relative mt-12 lg:mt-16 max-w-6xl mx-auto">
            <div className="relative rounded-xl bg-gradient-to-br from-brand-100 to-cyan-100 p-2 shadow-2xl ring-1 ring-slate-900/10">
              <img
                src="/screenshots/dashboardwallwidgets.png"
                alt="ForgePSA dashboard with operational widgets"
                loading="eager"
                className="rounded-lg w-full h-auto block border border-slate-200"
              />
            </div>
            {/* Gradient fade at the bottom for a more "infinite scroll" feel */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent rounded-b-xl pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything you need to run your MSP</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Replace ConnectWise, Halo, Autotask, and a dozen point tools. ForgePSA ships with the features MSPs actually use.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<Ticket />} title="Tickets & SLA" desc="Full service desk with configurable SLA policies, auto-assignment, email-to-ticket, and AI reply assistance." />
            <Feature icon={<Receipt />} title="Contracts & Invoicing" desc="Recurring billing, block-hours contracts, auto-invoicing, Stripe + QuickBooks Payments + ConnectBooster." />
            <Feature icon={<Users />} title="Customer Portal" desc="White-labeled portal with passkeys, ticket submission, invoice payment, and quote approval." />
            <Feature icon={<Clock />} title="Time Tracking" desc="Start/stop timers on tickets, automatic billability rules, per-tech rates, and exportable reports." />
            <Feature icon={<Package />} title="Product Catalog" desc="Sell licenses and services with Pax8 sync, QBO item mapping, and gross-margin tracking." />
            <Feature icon={<DollarSign />} title="Quotes" desc="Branded quotes that customers approve online. Convert to contracts or invoices in one click." />
            <Feature icon={<Mail />} title="Email Everything" desc="Gmail OAuth, SMTP, Mailjet for billing. Email-to-ticket and customer replies threaded automatically." />
            <Feature icon={<Sparkles />} title="AI Assistant" desc="Summarize tickets, rewrite replies in a professional tone, and move faster on support." />
            <Feature icon={<Shield />} title="Enterprise Security" desc="SSO via Microsoft Entra, Google Workspace, SAML. Encrypted credentials, passkeys, audit logs." />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="py-16 bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-4 text-center">
          <Stat value="45 days" label="Free trial, no card required" />
          <Stat value="5-in-1" label="Replace PSA + RMM + billing + portal + accounting sync" />
          <Stat value="< 5 min" label="From signup to first ticket" />
          <Stat value="$0" label="Setup fees. Ever." />
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h2>
          <p className="text-lg text-slate-600 mb-10">Starts at $49/tech/month. All features. All integrations.</p>

          <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto mb-10">
            <PricingSummary name="Starter" price="$49" desc="Solo operators + small teams (1-3 techs)" />
            <PricingSummary name="Pro" price="$79" featured desc="Growing MSPs (4-15 techs)" />
            <PricingSummary name="Enterprise" price="Custom" desc="16+ techs, dedicated instance" />
          </div>

          <button
            onClick={() => navigate('/pricing')}
            className="text-brand-600 hover:text-brand-700 font-semibold"
          >
            See full pricing comparison →
          </button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl px-8 py-16 text-white shadow-2xl shadow-brand-600/30">
            <Zap className="h-12 w-12 text-white mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to forge a better MSP?</h2>
            <p className="text-xl text-brand-100 mb-8 max-w-2xl mx-auto">
              Get started in under 5 minutes. No credit card. 45 days to try every feature.
            </p>
            <button
              onClick={() => navigate('/signup')}
              className="bg-white hover:bg-slate-100 text-brand-700 font-bold px-8 py-3 rounded-lg transition-colors shadow-lg"
            >
              Start your free trial
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group p-6 rounded-2xl border border-slate-200 bg-white hover:shadow-lg hover:border-brand-200 transition-all">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 mb-4 group-hover:bg-brand-600 group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}

function PricingSummary({ name, price, desc, featured }: { name: string; price: string; desc: string; featured?: boolean }) {
  return (
    <div className={`rounded-2xl p-6 border ${featured ? 'bg-brand-600 text-white border-brand-600 shadow-xl scale-105' : 'bg-white border-slate-200'}`}>
      <div className="text-sm font-semibold mb-1">{name}</div>
      <div className="text-3xl font-bold mb-1">{price}</div>
      <div className={`text-sm mb-3 ${featured ? 'text-brand-100' : 'text-slate-600'}`}>per tech/month</div>
      <div className={`text-xs ${featured ? 'text-brand-50' : 'text-slate-500'}`}>{desc}</div>
    </div>
  );
}
