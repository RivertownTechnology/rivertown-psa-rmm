import type { ComponentType } from 'react';

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readMinutes: number;
  category?: string;
  pillar?: boolean;
  related?: string[];
  Body: ComponentType;
};

/* ─────────────────── PILLAR: Choosing a PSA ─────────────────── */
function ChoosingAPsa() {
  return (
    <>
      <p>
        Picking a PSA is one of the most expensive decisions an MSP owner makes. It's not the license
        fee — it's the 18 months you'll spend on the tool whether you love it or hate it. This guide
        is the playbook we wish we'd had before we signed our first multi-year contract.
      </p>

      <h2>What a PSA actually needs to do</h2>
      <p>
        Strip the marketing away and every PSA in the market does the same five things:
      </p>
      <ol>
        <li><strong>Tickets.</strong> Capture, route, track, resolve. SLA timers, time entries, customer replies.</li>
        <li><strong>Contracts.</strong> Recurring services, block hours, flat rate, per-user, per-device.</li>
        <li><strong>Billing.</strong> Turn contracts + time into invoices and collect payment.</li>
        <li><strong>A customer record.</strong> Who are they, what do they pay, what's open, what's overdue.</li>
        <li><strong>Integrations.</strong> RMM, accounting, payments, license vendors, SSO.</li>
      </ol>
      <p>
        Everything else — catalogs, quotes, portals, AI, reporting, workflows — is a variation on one
        of those five. Don't let a sales deck convince you that a "360-degree unified command center"
        is a sixth thing. It isn't.
      </p>

      <h2>The five evaluation axes that actually matter</h2>
      <h3>1. Time to first invoice</h3>
      <p>
        If you can't run a test invoice to a test customer in the first week, the PSA is too complex
        for how MSPs actually buy. Ignore the feature checklist — the question is how fast a new tech
        can open a ticket, log time, and have it appear on the next invoice.
      </p>

      <h3>2. Integration depth, not integration count</h3>
      <p>
        "200+ integrations" usually means 10 first-class integrations and 190 Zapier webhook stubs.
        For each integration that matters (RMM, QuickBooks, Pax8, Stripe, your payment processor),
        ask: <em>is this two-way sync, or does it just push one direction?</em> Does it handle edge
        cases (merged customers, voided invoices, refunded payments) gracefully?
      </p>

      <h3>3. Plan gating</h3>
      <p>
        Read every plan page top to bottom. If QuickBooks, SSO, SLA policies, or custom fields are
        "Pro" or "Enterprise" only, you're going to end up paying for the top tier whether you need
        the rest of it or not. A good PSA includes those on every plan and only charges more for seat
        count or dedicated infrastructure.
      </p>

      <h3>4. Trial length</h3>
      <p>
        Billing is the scariest thing to validate in a PSA — an invoicing bug can screw up your cash
        flow for months. You can't validate billing in 14 days. You need to generate invoices, send
        them, receive payment, handle a refund, reconcile with your accountant's books. That takes
        30–45 days minimum. If the trial is shorter, the vendor is telling you they don't want you to
        validate billing before signing.
      </p>

      <h3>5. Data portability</h3>
      <p>
        Can you export everything — tickets, time, invoices, contacts, contracts — in a portable
        format, on demand, via UI or API? If the answer isn't an instant yes, your data is a hostage.
      </p>

      <h2>Budget: what PSAs really cost</h2>
      <p>
        Published seat prices are part of the story. The rest:
      </p>
      <ul>
        <li><strong>Implementation fees.</strong> ConnectWise and Halo deployments commonly run $3k–$15k through a partner.</li>
        <li><strong>Per-integration fees.</strong> QuickBooks sync, SSO, payment gateways, CSAT — priced à la carte on some platforms.</li>
        <li><strong>Annual "uplift."</strong> Read the contract. Many vendors bake in 5–10% automatic annual price increases.</li>
        <li><strong>Minimum seat counts.</strong> Some PSAs sell a 10-seat minimum even if you're a 3-person shop.</li>
      </ul>
      <p>
        A PSA priced at $75/seat with a $5k implementation fee, QBO add-on, and 10-seat minimum is
        $12,400 in year one. A $29/seat PSA with everything included and no implementation is
        $1,044. The difference buys you a tech, or a year of runway.
      </p>

      <h2>Red flags to walk away from</h2>
      <ul>
        <li>Sales gate on the trial.</li>
        <li>Card required upfront.</li>
        <li>Multi-year contract required (monthly should be table stakes).</li>
        <li>SSO behind the top tier — this is a security anti-pattern.</li>
        <li>"Free" version that rate-limits you into the paid tier in week two.</li>
        <li>Support only available on the top tier.</li>
      </ul>

      <h2>Questions to ask on every demo</h2>
      <ol>
        <li>Can I run a full billing cycle in the trial, no card, no sales call?</li>
        <li>What's your actual sync model with my RMM? Two-way? Which fields?</li>
        <li>Which integrations are gated by plan?</li>
        <li>What does onboarding look like? How many hours of work is it for me?</li>
        <li>Show me a real export of a customer record. JSON or CSV — let's see the structure.</li>
        <li>What's your change management policy? How do I find out when a field changes?</li>
        <li>How do you price? What's included, what's extra, what goes up at renewal?</li>
      </ol>

      <h2>When to stay on what you have</h2>
      <p>
        Switching PSAs is expensive in time and risk, even when the new one is objectively better.
        Stay if:
      </p>
      <ul>
        <li>Your current tool is working and you have less than a year of data to migrate.</li>
        <li>You're about to close a major acquisition — wait until after the dust settles.</li>
        <li>You don't have an operator who can own the migration for 4–6 weeks.</li>
      </ul>
      <p>
        Switch if any of the following are true: your techs avoid using it, you're paying for features
        you don't use, integrations keep breaking, or the vendor raised your price without adding
        value.
      </p>

      <h2>The migration plan</h2>
      <ol>
        <li><strong>Pick the cutover date.</strong> Month boundary, mid-week, not during a client-critical project.</li>
        <li><strong>Export everything from the old tool.</strong> Customers, contacts, contracts, tickets, time entries, invoices.</li>
        <li><strong>Import in this order:</strong> Companies → sites → contacts → contracts → open tickets → historical tickets → invoices.</li>
        <li><strong>Run parallel for 30 days.</strong> New work in the new tool, old work closes out in the old tool.</li>
        <li><strong>Cut off write access to the old tool at day 31.</strong> Keep read-only for 90 days for reference.</li>
        <li><strong>Archive.</strong> Keep a full export forever — it's cheap insurance.</li>
      </ol>

      <h2>TL;DR</h2>
      <p>
        A PSA is the operating system of your MSP. Pick one that's fast to try, priced without
        surprises, honest about what it doesn't do, and committed to your data portability. Every
        other evaluation criterion is downstream of those four.
      </p>
    </>
  );
}

/* ─────────────────── ARTICLE: HaloPSA alternatives 2026 ─────────────────── */
function HaloPsaAlternatives() {
  return (
    <>
      <p>
        HaloPSA is a legitimately capable tool. It's also expensive, heavy, and feels designed for a
        larger IT organization than most MSPs are. If you're looking at renewal, or you've already
        decided Halo isn't the shape you want to grow into, this is the 2026 shortlist.
      </p>

      <h2>Why MSPs look for Halo alternatives</h2>
      <ul>
        <li><strong>The 5-user minimum.</strong> A 2-tech shop pays for 3 unused seats. At ~$85/agent, that\'s $255/mo for nothing.</li>
        <li><strong>Price per seat.</strong> $85/agent starts to hurt once you\'re past 10 techs.</li>
        <li><strong>Implementation overhead.</strong> Halo is deep enough that real deployments still need design sessions and data mapping — weeks of work before your first ticket.</li>
        <li><strong>Top-tier feature gating.</strong> Integrations you need are often plan-gated.</li>
      </ul>
      <p>
        None of this is disqualifying for a 25+ tech MSP with dedicated PSA admins. It\'s a lot for a
        1–15 tech shop. (And to be clear: Halo\'s UI is modern and genuinely good — this isn\'t a
        "legacy software" complaint.)
      </p>

      <h2>The shortlist</h2>

      <h3>ForgePSA</h3>
      <p>
        The alternative we built. Modern stack, $29/tech launch pricing (locked for life), no user
        minimum, 45-day no-card trial. Pax8 margin tracking and Google SSO are on every plan; Pro
        unlocks QuickBooks Online, AI ticket assistance, and SLA policies. NinjaOne credentials
        store today with two-way sync shipping as our next release. ConnectWise companies importer
        is live (contacts, tickets, and contracts are rolling out). For 3–50 tech MSPs that want to
        keep their RMM and land on a modern PSA today, this is what we\'d pick.
      </p>

      <h3>Syncro</h3>
      <p>
        The easy-to-start pick for 1–5 tech shops. $139/user flat. Includes its own RMM — which is
        great if you don't have one yet, and a dealbreaker if you do. Thinner integrations than the
        market leaders.
      </p>

      <h3>SuperOps</h3>
      <p>
        Newer, modern UI, AI-forward marketing. ~$79/tech. Ships with its own RMM — same lock-in
        story as Syncro. Solid for greenfield MSPs. A tough switch if you've already standardized on
        NinjaRMM or Datto.
      </p>

      <h3>ConnectWise Manage</h3>
      <p>
        Not really a "Halo alternative" — it's the other incumbent you evaluate against Halo. Deep,
        proven, expensive, and slow. Good fit if you're 100+ techs with custom workflows.
      </p>

      <h3>Atera</h3>
      <p>
        Per-technician pricing that's appealing, but Atera is an RMM-first tool with a lighter PSA
        bolted on. If PSA is your primary need, look elsewhere.
      </p>

      <h3>NinjaOne (their PSA)</h3>
      <p>
        Newer to PSA than it is to RMM. Maturing quickly. If you want a single-vendor bundle in the
        future, it\'s worth a look. If you want a mature PSA today, pair NinjaOne\'s RMM with
        ForgePSA.
      </p>

      <h2>How to actually pick</h2>
      <p>
        Short version: run a free trial of the two that fit your RMM posture. Generate a test invoice
        in week one. Run a billing cycle by week six. Talk to a current customer in week three. If
        the tool doesn't survive all three of those, it's not your PSA.
      </p>

      <h2>ForgePSA's migration offer</h2>
      <p>
        We built a CSV importer for companies, contacts, contracts, and tickets — including direct
        support for ConnectWise-format exports, which most Halo exports can be mapped to in a
        spreadsheet. If you've got a Halo tenant you want to move, email us and we'll walk the
        mapping with you. No implementation fee.
      </p>

      <h2>TL;DR</h2>
      <p>
        If you're a 3–50 tech MSP on Halo and the price-per-seat or the heaviness is what's pushing
        you to look, ForgePSA is the most direct upgrade path. Try it for 45 days. No card.
      </p>
    </>
  );
}

export const posts: BlogPost[] = [
  {
    slug: 'choosing-a-psa',
    title: 'Choosing a PSA: the complete 2026 buyer\'s guide for MSPs',
    excerpt:
      'The framework we wish we\'d had before signing our first multi-year PSA contract. Evaluation axes, red flags, budget math, and a migration playbook.',
    date: 'April 12, 2026',
    readMinutes: 12,
    category: 'Pillar guide',
    pillar: true,
    related: ['halopsa-alternatives-2026'],
    Body: ChoosingAPsa,
  },
  {
    slug: 'halopsa-alternatives-2026',
    title: 'HaloPSA alternatives in 2026: the honest shortlist',
    excerpt:
      'Why MSPs leave Halo, what the real alternatives are, and how to pick one that fits your RMM and your budget.',
    date: 'April 12, 2026',
    readMinutes: 6,
    category: 'Tool selection',
    related: ['choosing-a-psa'],
    Body: HaloPsaAlternatives,
  },
];
