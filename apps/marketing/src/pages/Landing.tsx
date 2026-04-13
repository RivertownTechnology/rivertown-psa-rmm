import {
  Ticket, Receipt, Users, Clock, Zap,
  Shield, Sparkles, Package, DollarSign, Mail,
} from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Landing({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'ForgePSA — Modern PSA Software for MSPs',
    'Modern Professional Services Automation for managed service providers. Tickets, billing, contracts, customer portal, and native NinjaRMM integration. 45-day free trial.',
  );
  return (
    <>
      {/* Hero */}
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
              The modern <span className="text-brand-600 dark:text-brand-400">PSA</span> built for how MSPs actually work.
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
              Tickets, contracts, billing, quotes, and a customer portal — in one tool that connects
              cleanly to NinjaRMM (with more RMM integrations on the way).
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
                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                See how it works
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">No credit card required · Cancel anytime · Full access during trial</p>
          </div>

          {/* Hero screenshot — main dashboard */}
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

      {/* Features grid */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">Everything an MSP needs in one PSA</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Modern ticketing, time tracking, contracts, invoicing, a customer portal, and the integrations
              MSPs actually use day to day.
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

      {/* Stats band — already dark in both modes by design */}
      <section className="py-16 bg-slate-950 text-white border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-4 text-center">
          <Stat value="45 days" label="Free trial, no card required" />
          <Stat value="< 5 min" label="From signup to first ticket" />
          <Stat value="NinjaRMM" label="Native sync today, more RMMs coming" />
          <Stat value="$0" label="Setup fees. Ever." />
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-24 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">Simple, transparent pricing</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-2">Starts at $29/tech/month. All features. All integrations.</p>
          <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded-full px-3 py-1 text-xs font-semibold mb-10">
            🎉 Launch pricing — locked in for life
          </div>

          <div className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto mb-10">
            <PricingSummary name="Starter" price="$29" originalPrice="$49" desc="Solo operators + small teams (1-3 techs)" />
            <PricingSummary name="Pro" price="$49" originalPrice="$79" featured desc="Growing MSPs (4-15 techs)" />
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

      {/* Final CTA */}
      <section className="py-24 bg-white dark:bg-slate-950">
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
    <div className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:shadow-lg hover:border-brand-200 dark:hover:border-brand-700 transition-all">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 mb-4 group-hover:bg-brand-600 group-hover:text-white dark:group-hover:bg-brand-600 dark:group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300">{desc}</p>
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
