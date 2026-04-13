import { Check, X, Sparkles } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Pricing({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Pricing — ForgePSA',
    'Simple per-tech pricing for ForgePSA. Starter $49, Pro $79, Enterprise custom. Every plan includes NinjaRMM and Pax8. 45-day free trial, no credit card.',
  );
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700 mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Simple, honest pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            One price. All features. No games.
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Every plan includes every integration, every feature, and unlimited tickets. Pay per tech, cancel anytime.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <Plan
              name="Starter"
              price="$49"
              sub="per tech / month"
              desc="Solo operators and small teams who want a modern PSA without the legacy bloat."
              features={[
                'Up to 3 techs',
                'Unlimited tickets & contacts',
                'All core PSA features',
                'NinjaRMM sync included',
                'Pax8 licensing + cost tracking',
                'Gmail + SMTP email',
                'Stripe payment links',
                'Google SSO',
                'Email support',
              ]}
              cta="Start free trial"
              onCta={() => navigate('/signup')}
            />
            <Plan
              name="Pro"
              price="$79"
              sub="per tech / month"
              desc="Growing MSPs that need accounting, AI, SLAs, and advanced SSO."
              features={[
                '4–15 techs',
                'Everything in Starter',
                'QuickBooks Online sync',
                'ConnectBooster payments',
                'CrewHu CSAT surveys',
                'AI ticket assistant (Claude)',
                'SLA policies + escalation rules',
                'Twilio SMS per-tenant',
                'Microsoft Entra SSO',
                'ConnectWise / CSV data import',
                'Priority email + chat support',
              ]}
              cta="Start free trial"
              onCta={() => navigate('/signup')}
              featured
            />
            <Plan
              name="Enterprise"
              price="Custom"
              sub="16+ techs"
              desc="Large MSPs with compliance, SAML, and dedicated-instance needs."
              features={[
                '16+ techs',
                'Everything in Pro',
                'SAML 2.0 SSO (Okta, Duo, OneLogin, JumpCloud)',
                'Dedicated database instance option',
                'Custom SLA with response guarantees',
                'Named customer success manager',
                'Annual contracts available',
              ]}
              cta="Talk to sales"
              onCta={() => { window.location.href = 'mailto:sales@forgepsa.com'; }}
            />
          </div>

          <p className="text-center text-sm text-slate-500 mt-8">
            All plans: 45-day free trial · No credit card required · No setup fees
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">What's in each plan</h2>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-slate-900">Feature</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900">Starter</th>
                  <th className="text-center px-6 py-4 font-semibold text-brand-700 bg-brand-50">Pro</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <Row label="Tickets, tasks, time tracking" s pro ent />
                <Row label="Contracts & recurring invoicing" s pro ent />
                <Row label="Customer portal with passkeys" s pro ent />
                <Row label="Quotes & approvals" s pro ent />
                <Row label="Product catalog" s pro ent />
                <Row label="Stripe payment links" s pro ent />
                <Row label="Gmail / SMTP email" s pro ent />
                <Row label="Google SSO" s pro ent />
                <Row label="NinjaRMM integration" s pro ent />
                <Row label="Pax8 license sync + margin tracking" s pro ent />
                <Row label="QuickBooks Online sync" pro ent />
                <Row label="ConnectBooster payments" pro ent />
                <Row label="CrewHu CSAT surveys" pro ent />
                <Row label="AI ticket assistant (Claude)" pro ent />
                <Row label="SLA policies" pro ent />
                <Row label="SLA escalation workflows" pro ent />
                <Row label="Twilio SMS (per-tenant)" pro ent />
                <Row label="Microsoft Entra SSO" pro ent />
                <Row label="ConnectWise / CSV data import" pro ent />
                <Row label="Custom fields on every entity" pro ent />
                <Row label="Support ticket inbox to ForgePSA" s pro ent />
                <Row label="SAML 2.0 SSO" ent />
                <Row label="Dedicated database instance" ent />
                <Row label="Custom portal subdomain" ent />
                <Row label="Named CSM + priority SLA response" ent />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-10">Pricing FAQ</h2>
          <div className="space-y-6">
            <FAQ q="Do I need a credit card to start?" a="No. Signup takes 2 minutes and we don't ask for billing info until the trial ends." />
            <FAQ q="What happens after my 45-day trial?" a="Your account enters read-only mode. You can still log in, export your data, or add a subscription at any time. We never delete tenant data." />
            <FAQ q="Can I change plans later?" a="Yes — upgrade or downgrade at any time from your billing settings. Changes prorate automatically." />
            <FAQ q="How does per-tech billing work?" a="You're billed monthly for each active user with a 'tech' or 'admin' role. Portal users (your customers) are always free and unlimited." />
            <FAQ q="Do you offer discounts for annual billing?" a="Yes — 15% off for annual prepay. Available on all plans at checkout." />
            <FAQ q="What integrations are included?" a="Every plan includes every integration we support. Pro unlocks the third-party ones that require a paid account on the other side (QuickBooks, Pax8, etc.)." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Ready to try ForgePSA?</h2>
          <p className="text-lg text-slate-600 mb-8">
            45 days, full access, no card. Pick a plan when you're ready — not before.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
          >
            Start your free trial
          </button>
        </div>
      </section>
    </>
  );
}

function Plan({
  name, price, sub, desc, features, cta, onCta, featured,
}: {
  name: string; price: string; sub: string; desc: string;
  features: string[]; cta: string; onCta: () => void; featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-8 border ${
        featured
          ? 'bg-slate-950 text-white border-slate-950 shadow-2xl lg:scale-105'
          : 'bg-white border-slate-200'
      }`}
    >
      {featured && (
        <div className="inline-block bg-brand-600 text-white text-xs font-semibold px-2 py-1 rounded mb-4">
          MOST POPULAR
        </div>
      )}
      <div className={`text-sm font-semibold mb-2 ${featured ? 'text-brand-300' : 'text-brand-600'}`}>{name}</div>
      <div className="flex items-baseline gap-1 mb-1">
        <div className="text-5xl font-bold">{price}</div>
      </div>
      <div className={`text-sm mb-4 ${featured ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</div>
      <p className={`text-sm mb-6 ${featured ? 'text-slate-300' : 'text-slate-600'}`}>{desc}</p>

      <button
        onClick={onCta}
        className={`w-full font-semibold px-6 py-3 rounded-lg transition-colors mb-6 ${
          featured
            ? 'bg-brand-600 hover:bg-brand-700 text-white'
            : 'bg-slate-900 hover:bg-slate-800 text-white'
        }`}
      >
        {cta}
      </button>

      <ul className="space-y-3">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${featured ? 'text-brand-400' : 'text-brand-600'}`} />
            <span className={featured ? 'text-slate-200' : 'text-slate-700'}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, s, pro, ent }: { label: string; s?: boolean; pro?: boolean; ent?: boolean }) {
  return (
    <tr>
      <td className="px-6 py-3 text-slate-700">{label}</td>
      <td className="px-6 py-3 text-center">
        {s ? <Check className="h-4 w-4 text-brand-600 inline" /> : <X className="h-4 w-4 text-slate-300 inline" />}
      </td>
      <td className="px-6 py-3 text-center bg-brand-50/40">
        {pro ? <Check className="h-4 w-4 text-brand-600 inline" /> : <X className="h-4 w-4 text-slate-300 inline" />}
      </td>
      <td className="px-6 py-3 text-center">
        {ent ? <Check className="h-4 w-4 text-brand-600 inline" /> : <X className="h-4 w-4 text-slate-300 inline" />}
      </td>
    </tr>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-slate-200 pb-6">
      <h3 className="font-semibold text-slate-900 mb-2">{q}</h3>
      <p className="text-slate-600">{a}</p>
    </div>
  );
}
