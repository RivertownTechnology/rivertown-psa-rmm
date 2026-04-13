import { Check, X, Sparkles } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Pricing({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Pricing — ForgePSA',
    'Simple per-tech pricing for ForgePSA. Starter $29, Pro $49, Enterprise custom (launch pricing, locked for life). Pax8 on every plan. 45-day free trial, no credit card.',
  );
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Simple, honest pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            One price. All features. No games.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-8">
            Core PSA features and Pax8 are in on every plan. Pro unlocks QuickBooks, AI, SMS, and advanced SSO. Unlimited tickets. Pay per tech. Cancel anytime.
          </p>
          <div className="max-w-3xl mx-auto bg-amber-400 rounded-xl px-6 py-4 text-left sm:text-center">
            <p className="text-base sm:text-lg text-amber-950 font-medium">
              Tired of 7- or 14-day trials that don't even cover one billing cycle?
              <span className="block sm:inline mt-1 sm:mt-0 sm:ml-2 font-bold">Yeaaaah, so were we.</span>
            </p>
            <p className="text-sm text-amber-950/80 mt-1">
              ForgePSA gives you a <strong>full 45 days</strong> — enough time to actually run an invoice cycle, onboard a customer, and decide.
            </p>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <Plan
              name="Starter"
              price="$29"
              originalPrice="$49"
              introBadge="Launch pricing"
              sub="per tech / month"
              desc="Solo operators and small teams who want a modern PSA without the legacy bloat."
              features={[
                'Up to 3 techs',
                'Unlimited tickets & contacts',
                'All core PSA features',
                'Pax8 licensing + cost tracking',
                'Gmail OAuth + SMTP email',
                'Mailjet billing emails',
                'Stripe payment links',
                'Google Workspace SSO',
                'Customer portal with passkeys',
                'NinjaOne credentials storage (sync coming soon)',
                'Email support',
              ]}
              cta="Start free trial"
              onCta={() => navigate('/signup')}
            />
            <Plan
              name="Pro"
              price="$49"
              originalPrice="$79"
              introBadge="Launch pricing"
              sub="per tech / month"
              desc="Growing MSPs that need accounting, AI, and SLA automation."
              features={[
                '4–15 techs',
                'Everything in Starter',
                'QuickBooks Online sync',
                'AI ticket assistant (Claude)',
                'SLA policies',
                'Twilio SMS per tenant',
                'ConnectWise companies importer',
                'ConnectBooster payments (coming soon)',
                'CrewHu CSAT surveys (coming soon)',
                'Microsoft Entra SSO (coming soon)',
                'SLA escalation workflows (coming soon)',
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
                'SAML 2.0 SSO (coming soon)',
                'Dedicated database instance (coming soon)',
                'Custom portal subdomain (coming soon)',
                'Custom SLA with response guarantees',
                'Named customer success manager',
                'Annual contracts available',
              ]}
              cta="Talk to sales"
              onCta={() => { window.location.href = 'mailto:sales@forgepsa.com'; }}
            />
          </div>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8">
            All plans: 45-day free trial · No credit card required · No setup fees
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-12">What's in each plan</h2>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900 dark:text-white">Starter</th>
                  <th className="text-center px-6 py-4 font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40">Pro</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900 dark:text-white">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <Row label="Tickets, tasks, time tracking" s pro ent />
                <Row label="Email-to-ticket integration" s pro ent />
                <Row label="Contracts & recurring invoicing" s pro ent />
                <Row label="Customer portal with passkeys" s pro ent />
                <Row label="Quotes & approvals" s pro ent />
                <Row label="Product catalog with margin tracking" s pro ent />
                <Row label="Stripe payment links" s pro ent />
                <Row label="Gmail OAuth / SMTP / Mailjet email" s pro ent />
                <Row label="Google Workspace SSO" s pro ent />
                <Row label="Pax8 license sync + margin tracking" s pro ent />
                <Row label="NinjaOne / NinjaRMM sync" s="soon" pro="soon" ent="soon" soon />
                <Row label="QuickBooks Online sync" pro ent />
                <Row label="AI ticket assistant (Claude)" pro ent />
                <Row label="SLA policies" pro ent />
                <Row label="Twilio SMS (per tenant)" pro ent />
                <Row label="ConnectWise companies importer" pro ent />
                <Row label="Custom fields on every entity" pro ent />
                <Row label="Contacts / tickets / contracts importer" pro="soon" ent="soon" soon />
                <Row label="SLA escalation workflows" pro="soon" ent="soon" soon />
                <Row label="ConnectBooster payments" pro="soon" ent="soon" soon />
                <Row label="CrewHu CSAT surveys" pro="soon" ent="soon" soon />
                <Row label="Microsoft Entra SSO" pro="soon" ent="soon" soon />
                <Row label="SAML 2.0 SSO" ent="soon" soon />
                <Row label="Dedicated database instance" ent="soon" soon />
                <Row label="Custom portal subdomain" ent="soon" soon />
                <Row label="Named CSM + priority SLA response" ent />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-10">Pricing FAQ</h2>
          <div className="space-y-6">
            <FAQ q="Do I need a credit card to start?" a="No. Signup takes 2 minutes and we don't ask for billing info until the trial ends." />
            <FAQ q="What happens after my 45-day trial?" a="Your account enters read-only mode. You can still log in, export your data, or add a subscription at any time. We never delete tenant data." />
            <FAQ q="Can I change plans later?" a="Yes — upgrade or downgrade at any time from your billing settings. Changes prorate automatically." />
            <FAQ q="How does per-tech billing work?" a="You're billed monthly for each active user with a 'tech' or 'admin' role. Portal users (your customers) are always free and unlimited." />
            <FAQ q="Do you offer discounts for annual billing?" a="Yes — 15% off for annual prepay. Available on all plans at checkout." />
            <FAQ q="What integrations are included on each plan?" a="Starter gets Pax8, Stripe, Gmail/SMTP/Mailjet email, and Google SSO. Pro adds QuickBooks Online, AI ticket assistant, SLA policies, Twilio SMS, and the ConnectWise companies importer. Enterprise adds SAML 2.0 SSO (coming soon) plus dedicated-instance options. NinjaOne/NinjaRMM, ConnectBooster, CrewHu, and Microsoft Entra SSO have credentials UI live today with full sync shipping soon." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">Ready to try ForgePSA?</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
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
  name, price, originalPrice, introBadge, sub, desc, features, cta, onCta, featured,
}: {
  name: string; price: string; sub: string; desc: string;
  features: string[]; cta: string; onCta: () => void; featured?: boolean;
  originalPrice?: string;
  introBadge?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-8 border ${
        featured
          ? 'bg-slate-950 text-white border-slate-950 dark:border-slate-700 shadow-2xl lg:scale-105'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {featured && (
          <div className="inline-block bg-brand-600 text-white text-xs font-semibold px-2 py-1 rounded">
            MOST POPULAR
          </div>
        )}
        {introBadge && (
          <div className="inline-block text-xs font-semibold px-2 py-1 rounded bg-amber-400 text-amber-950">
            {introBadge}
          </div>
        )}
      </div>
      <div className={`text-sm font-semibold mb-2 ${featured ? 'text-brand-300' : 'text-brand-600 dark:text-brand-400'}`}>{name}</div>
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        {originalPrice && (
          <div className={`text-2xl font-bold line-through ${
            featured ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {originalPrice}
          </div>
        )}
        <div className={`text-5xl font-bold ${featured ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{price}</div>
      </div>
      <div className={`text-sm mb-4 ${featured ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{sub}</div>
      <p className={`text-sm mb-6 ${featured ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}`}>{desc}</p>

      <button
        onClick={onCta}
        className={`w-full font-semibold px-6 py-3 rounded-lg transition-colors mb-6 ${
          featured
            ? 'bg-brand-600 hover:bg-brand-700 text-white'
            : 'bg-slate-900 hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700 text-white'
        }`}
      >
        {cta}
      </button>

      <ul className="space-y-3">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${featured ? 'text-brand-400' : 'text-brand-600 dark:text-brand-400'}`} />
            <span className={featured ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200'}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Cell = boolean | 'soon';

function Row({ label, s, pro, ent, soon }: { label: string; s?: Cell; pro?: Cell; ent?: Cell; soon?: boolean }) {
  return (
    <tr>
      <td className="px-6 py-3 text-slate-700 dark:text-slate-200">
        {label}
        {soon && (
          <span className="ml-2 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500 text-white align-middle">Soon</span>
        )}
      </td>
      <td className="px-6 py-3 text-center"><RowCell v={s} /></td>
      <td className="px-6 py-3 text-center bg-brand-50/40 dark:bg-brand-950/30"><RowCell v={pro} /></td>
      <td className="px-6 py-3 text-center"><RowCell v={ent} /></td>
    </tr>
  );
}

function RowCell({ v }: { v?: Cell }) {
  if (v === 'soon') return <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500 text-white">Soon</span>;
  if (v === true) return <Check className="h-4 w-4 text-brand-600 dark:text-brand-400 inline" />;
  return <X className="h-4 w-4 text-slate-300 dark:text-slate-600 inline" />;
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-700 pb-6">
      <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{q}</h3>
      <p className="text-slate-600 dark:text-slate-300">{a}</p>
    </div>
  );
}
