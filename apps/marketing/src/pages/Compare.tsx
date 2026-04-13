import { Check, X as XIcon, ArrowRight, Scale, Heart, AlertCircle, Trophy, FileInput } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

type Row = { label: string; forge: string | boolean; them: string | boolean };

type Competitor = {
  slug: string;
  name: string;
  shortName: string;
  blurb: string;
  honestSummary: string;
  niceThings: string[];
  matrix: Row[];
  losesDealsTo: { title: string; desc: string }[];
  stillRightFor: string;
  migration: string;
};

const competitors: Competitor[] = [
  {
    slug: 'halopsa',
    name: 'HaloPSA',
    shortName: 'Halo',
    blurb: 'The capable, modern heavyweight. Genuinely good software — with a 5-user minimum and a high floor.',
    honestSummary:
      'HaloPSA is legitimately good. Modern UI, deep feature set, active development. The catch is cost and commitment: ~$85/agent with a 5-user minimum means your floor is ~$425/mo before your first invoice — whether you have 2 techs or 5. ForgePSA wins on the first-dollar cost, the 1-tech entry point, and the speed-to-first-invoice for MSPs that don\'t need ITIL-depth reporting.',
    niceThings: [
      'Modern, well-designed UI (the legacy-PSA comparison doesn\'t fit Halo)',
      'Genuinely deep feature set — reporting, ITIL workflows, CMDB',
      'Strong community and training ecosystem',
      'Well-suited to 25+ tech deployments with dedicated admins',
      'Solid integration catalog',
    ],
    matrix: [
      { label: 'Starting price / tech / mo', forge: '$29', them: '~$85' },
      { label: 'Minimum users billed', forge: '1', them: '5-user minimum' },
      { label: 'Effective monthly floor', forge: '$29', them: '~$425' },
      { label: 'Free trial', forge: '45 days, no card', them: '30 days, card typically required' },
      { label: 'Typical time to first invoice', forge: 'Same day', them: '2–4 weeks' },
      { label: 'Customer portal passkeys', forge: true, them: false },
      { label: 'Launch pricing locked for life', forge: true, them: false },
      { label: 'Pax8 margin tracking on Starter', forge: true, them: false },
      { label: 'QuickBooks included on Pro (no uplift)', forge: true, them: 'Tier-gated' },
    ],
    losesDealsTo: [
      {
        title: 'You\'re under 5 techs and Halo\'s minimum forces you to pay for seats you don\'t have',
        desc: 'Halo\'s 5-user minimum means a 2-tech shop pays for 3 extra seats. At ~$85/seat, that\'s $255/mo for nothing. ForgePSA bills what you use — 1 tech or 100.',
      },
      {
        title: 'You want to start in minutes, not weeks',
        desc: 'Halo is a real implementation — design sessions, customization, data mapping, training. Legitimate for 25-tech shops; overkill if you just want tickets and invoicing today.',
      },
      {
        title: 'You want your Pax8 margins on the starter plan, not gated behind Pro',
        desc: 'Pax8 product sync with cost + margin tracking is on every ForgePSA plan. We think margin visibility should be the default, not an upsell.',
      },
    ],
    stillRightFor:
      'A 25+ tech MSP with dedicated PSA admins, custom ITIL workflows, and heavy reporting demands. Halo goes deeper than we do for those shops, and that\'s OK.',
    migration:
      'ForgePSA has a CSV + ConnectWise-format importer for companies today (contacts, tickets, and contracts are next). Halo can export to CSV from most of its screens — email us with a sample and we\'ll walk the mapping.',
  },
  {
    slug: 'connectwise',
    name: 'ConnectWise PSA (Manage)',
    shortName: 'ConnectWise',
    blurb: 'The incumbent nobody loves but everybody has. Deep, old, and painful to leave.',
    honestSummary:
      'ConnectWise Manage runs a huge chunk of the MSP industry. It works, the ecosystem is enormous, and if you\'re a 100+ tech shop with 8 years of historical data, ripping it out isn\'t realistic. For the rest of us, it\'s bloated, expensive, and slow.',
    niceThings: [
      'Enormous partner and training ecosystem',
      'Long list of integrations (many are paid add-ons)',
      'Battle-tested at massive scale',
      'ScreenConnect integration is first-party',
    ],
    matrix: [
      { label: 'Starting price / tech / mo', forge: '$29', them: '~$75 + add-ons' },
      { label: 'Free trial', forge: '45 days, no card', them: 'Sales-gated' },
      { label: 'Typical onboarding time', forge: '< 1 day', them: '6–12 weeks' },
      { label: 'Modern UI / UX', forge: true, them: false },
      { label: 'Pax8 margin tracking on starter plan', forge: true, them: false },
      { label: 'Bring your own RMM', forge: true, them: true },
      { label: 'Native ConnectWise-format companies import', forge: true, them: '—' },
      { label: 'Launch pricing locked for life', forge: true, them: false },
    ],
    losesDealsTo: [
      {
        title: 'Your last implementation took 3 months and you don\'t want another',
        desc: 'We built an importer that accepts ConnectWise-format exports in Settings. Companies come in today; contacts, tickets, and contracts import is rolling out in the coming weeks. The cutover is hours of work, not weeks.',
      },
      {
        title: 'Your techs file tickets in other systems to avoid opening Manage',
        desc: 'That\'s not a rare story. A modern PSA that feels fast is a real retention lever.',
      },
      {
        title: 'Your MRR per tech is eaten by PSA licensing and add-ons',
        desc: 'ConnectWise Manage + integrations + ScreenConnect adds up quickly. ForgePSA is one price, everything included.',
      },
    ],
    stillRightFor:
      'You\'re a 100+ tech MSP already on ConnectWise with custom workflows, CPQ, and financial integrations you can\'t live without. Switching for switching\'s sake is not the play.',
    migration:
      'ForgePSA ships with a ConnectWise-format CSV importer in Settings → Import. Companies are live today; contacts, tickets, contracts, and time entry imports are rolling out. We\'ll help you plan the cutover — email us.',
  },
  {
    slug: 'syncro',
    name: 'Syncro',
    shortName: 'Syncro',
    blurb: 'The all-in-one for solo operators. Affordable and easy, until you outgrow it.',
    honestSummary:
      'Syncro is a solid pick for a 1–5 tech shop that wants one tool to do everything. The catch: you have to use their RMM. Once you grow past ~15 techs or want to keep an enterprise-grade RMM like NinjaRMM, the trade-offs start piling up.',
    niceThings: [
      'Genuinely good for solo operators and very small teams',
      'Flat pricing is easy to understand',
      'Built-in RMM is fine for SMB endpoints',
      'Active community',
    ],
    matrix: [
      { label: 'Starting price / tech / mo', forge: '$29', them: '$139 flat' },
      { label: 'Free trial', forge: '45 days', them: '14 days' },
      { label: 'Bring your own RMM (e.g. NinjaOne)', forge: true, them: false },
      { label: 'Scales past 15 techs cleanly', forge: true, them: 'Tight' },
      { label: 'AI ticket assistant (Claude)', forge: true, them: 'Limited' },
      { label: 'SLA policies', forge: true, them: 'Basic' },
      { label: 'QuickBooks Online sync on Pro', forge: true, them: 'Add-on' },
      { label: 'Launch pricing locked for life', forge: true, them: false },
    ],
    losesDealsTo: [
      {
        title: 'You already run NinjaOne / NinjaRMM and don\'t want to replace it',
        desc: 'Syncro bundles their own RMM. ForgePSA stores per-tenant NinjaOne credentials today and ships two-way device + patch sync next on the roadmap — so you keep the RMM your techs already know.',
      },
      {
        title: 'You\'re past 15 techs and the flat-rate model is pinching',
        desc: 'Syncro is priced for the sweet spot of 1–10 techs. ForgePSA scales down the per-seat cost and up the capabilities.',
      },
      {
        title: 'Your MSP needs real SLAs + escalations',
        desc: 'Our SLA engine (Pro) runs response + resolution timers, escalation rules, and tier-based policies. It was built for MSPs selling tiered contracts.',
      },
    ],
    stillRightFor:
      'A 1–5 tech MSP that wants one bill, one UI, one vendor — and is comfortable being locked into Syncro\'s RMM. That\'s a real market and Syncro serves it well.',
    migration:
      'Export your Syncro customers and tickets to CSV. Import them into ForgePSA via Settings → Import. Bring NinjaRMM (or your current RMM) along.',
  },
  {
    slug: 'superops',
    name: 'SuperOps',
    shortName: 'SuperOps',
    blurb: 'The newer all-in-one. Clean UI, AI-heavy marketing, and another RMM lock-in.',
    honestSummary:
      'SuperOps has built something modern and clean — credit where it\'s due. The trade-off is the same as Syncro\'s: their RMM, or bust. If you\'ve already standardized on a strong RMM, ForgePSA lets you keep it.',
    niceThings: [
      'Modern UI, refreshing to see in the category',
      'Genuinely shipping features, not just marketing',
      'AI features are legitimately well-integrated',
      'Good for greenfield MSPs evaluating from scratch',
    ],
    matrix: [
      { label: 'Starting price / tech / mo', forge: '$29', them: '~$79' },
      { label: 'Free trial', forge: '45 days, no card', them: '21 days, card required' },
      { label: 'Bring your own RMM', forge: true, them: false },
      { label: 'Pax8 margin tracking on starter plan', forge: true, them: 'Paid add-on' },
      { label: 'ConnectWise companies CSV import', forge: true, them: false },
      { label: 'AI ticket assistant (Claude)', forge: true, them: 'Varies' },
      { label: 'Launch pricing locked for life', forge: true, them: false },
    ],
    losesDealsTo: [
      {
        title: 'You want to run NinjaOne with a modern PSA',
        desc: 'That\'s exactly what we built ForgePSA to be. SuperOps ships its own RMM; you\'d be asked to replace yours. We store NinjaOne credentials today and ship device + patch sync as our next release.',
      },
      {
        title: 'Your Pax8 margin matters and you don\'t want it behind an add-on',
        desc: 'We treat Pax8 sync + margin tracking as core — not a paid module. Every plan, from day one.',
      },
      {
        title: 'You need 45 days, not 21, to evaluate',
        desc: 'Running a real invoice cycle takes 30+ days. 21 isn\'t enough. We set our trial to match how MSPs actually buy.',
      },
    ],
    stillRightFor:
      'A greenfield MSP that wants one vendor for PSA + RMM and is happy with SuperOps\' RMM decisions. If you haven\'t picked an RMM yet, their bundle is a reasonable pick.',
    migration:
      'Export your SuperOps tickets, customers, and contracts to CSV. Import via Settings → Import. Keep your RMM, integrate it with ForgePSA.',
  },
  {
    slug: 'ninjaone',
    name: 'NinjaOne',
    shortName: 'NinjaOne',
    blurb: 'A world-class RMM with a young PSA. Great stack — with ForgePSA as the PSA.',
    honestSummary:
      'NinjaOne makes the best RMM we\'ve ever used. Their PSA is newer and still maturing. The right move for most MSPs we talk to is NinjaOne for endpoints + ForgePSA for the business layer. Full disclosure: ForgePSA stores NinjaOne credentials today, with two-way device + patch sync as our next shipped feature.',
    niceThings: [
      'Best-in-class RMM UX, full stop',
      'Fast patching, clean device management',
      'Strong scripting + remote tools',
      'Their PSA is improving quickly',
    ],
    matrix: [
      { label: 'Starting price / tech / mo', forge: '$29', them: '~$75+' },
      { label: 'NinjaOne credential storage today', forge: true, them: '(same vendor)' },
      { label: 'NinjaOne two-way sync', forge: 'Next release', them: '(same vendor)' },
      { label: 'Launch pricing locked for life', forge: true, them: false },
      { label: 'Customer portal with passkeys', forge: true, them: 'Varies' },
      { label: 'ConnectWise companies CSV import', forge: true, them: 'Varies' },
      { label: 'Pax8 margin tracking on starter', forge: true, them: 'Varies' },
      { label: 'AI ticket assistant (Claude, opt-in)', forge: true, them: 'Varies' },
    ],
    losesDealsTo: [
      {
        title: 'You love NinjaOne\'s RMM but want a mature PSA now, not in 12 months',
        desc: 'Tickets, contracts, invoicing, customer portal, and Pax8 margin tracking are all shipped in ForgePSA today. Their PSA side is newer and less battle-tested.',
      },
      {
        title: 'You want pricing that doesn\'t move',
        desc: 'Launch pricing locks for life. We\'re not going to quietly uplift you at renewal.',
      },
      {
        title: 'You value portal passkeys',
        desc: 'Passkey (WebAuthn) login for portal users is live on every plan.',
      },
    ],
    stillRightFor:
      'If you want one vendor for RMM + PSA + the rest of the stack, NinjaOne\'s first-party bundle is the obvious pick. Otherwise pair NinjaOne with ForgePSA.',
    migration:
      'Already running NinjaOne? Drop your API credentials into ForgePSA today — storage is live. Two-way device + patch + alert sync is shipping as our next release; we\'ll notify your tenant the moment it lands.',
  },
];

export function Compare({ navigate, slug }: { navigate: (p: string) => void; slug?: string }) {
  if (slug) {
    const c = competitors.find((x) => x.slug === slug);
    if (c) return <CompetitorPage c={c} navigate={navigate} />;
  }
  return <CompareHub navigate={navigate} />;
}

function CompareHub({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'ForgePSA vs. HaloPSA, ConnectWise, Syncro, SuperOps, NinjaOne',
    'Honest, side-by-side comparisons of ForgePSA against the PSAs MSPs evaluate most often. Price, integrations, trials, and where each tool wins.',
  );

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <Scale className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Honest comparisons
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            How we stack up.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            We say nice things first. We say where each tool still wins. And we show you the matrix without marketing spin.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2">
            {competitors.map((c) => (
              <button
                key={c.slug}
                onClick={() => navigate(`/compare/${c.slug}`)}
                className="text-left p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:shadow-lg hover:border-brand-300 dark:hover:border-brand-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    ForgePSA vs. {c.name}
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{c.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Don't see your current tool?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Email{' '}
            <a href="mailto:hello@forgepsa.com" className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">
              hello@forgepsa.com
            </a>
            {' '}and we&rsquo;ll write the comparison. Seriously — if it would help you decide, it would help the next MSP too.
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

function CompetitorPage({ c, navigate }: { c: Competitor; navigate: (p: string) => void }) {
  useDocumentTitle(
    `ForgePSA vs. ${c.name} — Honest Comparison`,
    `Side-by-side comparison of ForgePSA and ${c.name}. Pricing, integrations, onboarding time, and where each tool wins deals.`,
  );

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
          <button
            onClick={() => navigate('/compare')}
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline mb-6 inline-flex items-center gap-1"
          >
            ← All comparisons
          </button>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            ForgePSA vs. <span className="text-brand-600 dark:text-brand-400">{c.name}</span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
            {c.honestSummary}
          </p>
        </div>
      </section>

      {/* Nice things first */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400">
              <Heart className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              First, the nice things about {c.shortName}
            </h2>
          </div>
          <ul className="space-y-2">
            {c.niceThings.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                <Check className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0 mt-1" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Matrix */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6 text-center">
            The matrix
          </h2>
          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                  <th className="text-center px-6 py-4 font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40">ForgePSA</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900 dark:text-white">{c.shortName}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {c.matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3 text-slate-700 dark:text-slate-200">{row.label}</td>
                    <td className="px-6 py-3 text-center bg-brand-50/40 dark:bg-brand-950/30">
                      <Cell v={row.forge} positive />
                    </td>
                    <td className="px-6 py-3 text-center"><Cell v={row.them} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Loses deals */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Where {c.shortName} loses deals to ForgePSA
            </h2>
          </div>
          <div className="space-y-6">
            {c.losesDealsTo.map((item, i) => (
              <div key={i} className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">
                  {item.title}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Where they're still the right call */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <Trophy className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Where {c.shortName} is still the right call
            </h2>
          </div>
          <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">
            {c.stillRightFor}
          </p>
        </div>
      </section>

      {/* Migration */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
              <FileInput className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Bringing your {c.shortName} data with you
            </h2>
          </div>
          <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed mb-4">
            {c.migration}
          </p>
          <button
            onClick={() => navigate('/guides/migration-checklist')}
            className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-semibold text-sm"
          >
            Download the PSA migration checklist →
          </button>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to try the alternative?
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
            45 days. Full product. No credit card. You'll know in week 6 whether it fits.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
            >
              Start 45-day free trial
            </button>
            <button
              onClick={() => navigate('/demo')}
              className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Book a demo first
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Cell({ v, positive }: { v: string | boolean; positive?: boolean }) {
  if (typeof v === 'boolean') {
    return v
      ? <Check className={`h-4 w-4 inline ${positive ? 'text-brand-600 dark:text-brand-400' : 'text-brand-600 dark:text-brand-400'}`} />
      : <XIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 inline" />;
  }
  return (
    <span className={`text-sm ${positive ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}>
      {v}
    </span>
  );
}
