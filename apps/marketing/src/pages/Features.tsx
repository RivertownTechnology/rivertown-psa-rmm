import {
  Ticket, Receipt, Users, Clock, Package, DollarSign, Mail, Sparkles,
  Shield, Zap, FileText, CreditCard, BarChart3, MessageSquare,
} from 'lucide-react';

export function Features({ navigate }: { navigate: (p: string) => void }) {
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700 mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Every feature. Every plan.
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Everything an MSP actually needs.
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            ForgePSA replaces ConnectWise, Halo, Autotask, QuickBooks sync tools, and your portal — in one app your techs will actually use.
          </p>
        </div>
      </section>

      {/* Service Desk */}
      <FeatureSection
        icon={<Ticket />}
        eyebrow="Service Desk"
        title="Tickets that move as fast as your techs"
        desc="A full PSA ticketing system built around how MSPs actually work — email-to-ticket, SLA policies, auto-assignment, and keyboard-first UI."
        bullets={[
          'Email-to-ticket with threaded customer replies',
          'SLA policies with response + resolution timers',
          'Auto-assignment by queue, skill, or round-robin',
          'Start/stop timers directly on ticket view',
          'Internal notes vs. customer-visible replies',
          'Bulk actions, saved filters, smart views',
        ]}
      />

      {/* Billing */}
      <FeatureSection
        icon={<Receipt />}
        eyebrow="Billing & Contracts"
        title="Recurring revenue without spreadsheets"
        desc="Block-hours contracts, recurring services, auto-invoicing, and a payment page customers actually pay on."
        bullets={[
          'Recurring monthly/quarterly/annual contracts',
          'Block-hours and prepaid-bank billing',
          'Auto-invoice generation on schedule',
          'Branded invoice emails via Mailjet or SMTP',
          'Public "click to view invoice" pages with Pay Now',
          'Stripe, QuickBooks Payments, ConnectBooster',
        ]}
        reversed
      />

      {/* Customer Portal */}
      <FeatureSection
        icon={<Users />}
        eyebrow="Customer Portal"
        title="A portal your customers will actually log in to"
        desc="White-labeled portal with passkey sign-in, ticket submission, invoice payment, and quote approval — all in one place."
        bullets={[
          'Passkey (WebAuthn) sign-in — no passwords needed',
          'SMS MFA via Twilio as a fallback',
          'Submit + track tickets with replies',
          'View and pay invoices with one click',
          'Approve quotes online, convert to contracts',
          'Fully white-labeled: your logo, your colors, your domain',
        ]}
      />

      {/* Time Tracking */}
      <FeatureSection
        icon={<Clock />}
        eyebrow="Time Tracking"
        title="Capture every billable minute"
        desc="Per-tech rates, per-contract rates, automatic billability rules, and exports your accountant will love."
        bullets={[
          'Start/stop timers on any ticket or project',
          'Manual time entry with backdating',
          'Per-tech billable rates with overrides per client',
          'Automatic billability based on contract + SLA',
          'Exportable time reports by tech, client, or period',
          'Flows directly into invoicing',
        ]}
        reversed
      />

      {/* Product Catalog */}
      <FeatureSection
        icon={<Package />}
        eyebrow="Product Catalog"
        title="Sell licenses and services without the spreadsheet"
        desc="Track what you sell, what it costs, and what margin you're making — with live Pax8 sync and QuickBooks mapping."
        bullets={[
          'Pax8 product sync with cost tracking',
          'Gross-margin reporting per product and per client',
          'QuickBooks Online item mapping',
          'Recurring license billing tied to contracts',
          'Markup rules and per-client pricing',
          'Product-level tax class configuration',
        ]}
      />

      {/* Quotes */}
      <FeatureSection
        icon={<FileText />}
        eyebrow="Quotes"
        title="Send quotes that close themselves"
        desc="Branded quote pages customers approve online, then convert to contracts or invoices with one click."
        bullets={[
          'Public quote page with your branding',
          'Customer-signed approval (no back-and-forth emails)',
          'One-click convert to contract, invoice, or ticket',
          'Line-item margin visible to your team, hidden from customers',
          'Expiration dates and auto-reminders',
          'PDF export for legal or procurement teams',
        ]}
        reversed
      />

      {/* Integrations grid */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Integrations that actually work</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Encrypted credentials per-tenant. OAuth where possible. Built-in, not bolted-on.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Integration icon={<DollarSign />} name="QuickBooks Online" desc="Two-way sync of customers, invoices, and payments." />
            <Integration icon={<CreditCard />} name="Stripe" desc="Card + ACH payment links on every invoice." />
            <Integration icon={<CreditCard />} name="ConnectBooster" desc="MSP-native payment processing with lower card fees." />
            <Integration icon={<Package />} name="Pax8" desc="License sync, cost tracking, gross margin reports." />
            <Integration icon={<Mail />} name="Gmail + SMTP" desc="Tenant-level email sending via Google OAuth or SMTP." />
            <Integration icon={<Mail />} name="Mailjet" desc="Transactional billing emails with deliverability tracking." />
            <Integration icon={<MessageSquare />} name="Twilio SMS" desc="Per-tenant SMS for MFA, reminders, and customer updates." />
            <Integration icon={<BarChart3 />} name="NinjaRMM" desc="Device, patch, and monitoring sync into the PSA." />
            <Integration icon={<Sparkles />} name="Anthropic Claude" desc="AI that summarizes tickets and drafts replies." />
            <Integration icon={<Users />} name="CrewHu" desc="Automated CSAT surveys on ticket close." />
            <Integration icon={<Shield />} name="Microsoft Entra" desc="OAuth SSO for your techs (Pro tier)." />
            <Integration icon={<Shield />} name="Google Workspace" desc="OAuth SSO for your techs (Pro tier)." />
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-4">
              <Shield className="h-6 w-6" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Built for MSP security standards</h2>
            <p className="text-lg text-slate-600">
              We know what our customers are audited on — ForgePSA is built to pass.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SecurityItem label="AES-256-GCM encryption for all stored credentials" />
            <SecurityItem label="JWT access + refresh tokens with Redis blacklist" />
            <SecurityItem label="CSRF protection on all state-changing endpoints" />
            <SecurityItem label="Rate limiting per IP + per user" />
            <SecurityItem label="Passkey (WebAuthn) + SMS MFA for portal users" />
            <SecurityItem label="SSO via Microsoft Entra, Google Workspace, SAML" />
            <SecurityItem label="Full audit log of admin actions" />
            <SecurityItem label="Tenant-isolated data at every query boundary" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl px-8 py-16 text-white shadow-2xl shadow-brand-600/30">
            <Zap className="h-12 w-12 text-white mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Try every feature. Free for 45 days.</h2>
            <p className="text-xl text-brand-100 mb-8 max-w-2xl mx-auto">
              No credit card, no sales call, no setup fees. Just sign up and start running your MSP better.
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

function FeatureSection({
  icon, eyebrow, title, desc, bullets, reversed,
}: {
  icon: React.ReactNode; eyebrow: string; title: string; desc: string;
  bullets: string[]; reversed?: boolean;
}) {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid gap-12 lg:grid-cols-2 items-center ${reversed ? 'lg:grid-flow-dense' : ''}`}>
          <div className={reversed ? 'lg:col-start-2' : ''}>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 mb-4">
              {icon}
            </div>
            <div className="text-sm font-semibold text-brand-600 uppercase tracking-wide mb-2">{eyebrow}</div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">{title}</h2>
            <p className="text-lg text-slate-600 mb-6">{desc}</p>
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-700">
                  <span className="text-brand-600 font-bold mt-1">›</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`${reversed ? 'lg:col-start-1 lg:row-start-1' : ''} bg-gradient-to-br from-brand-50 to-slate-100 rounded-2xl h-80 border border-slate-200 flex items-center justify-center`}>
            <div className="text-slate-400 text-sm">Screenshot</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Integration({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-brand-200 transition-all">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 mb-3">
        {icon}
      </div>
      <div className="font-semibold text-slate-900 mb-1">{name}</div>
      <div className="text-sm text-slate-600">{desc}</div>
    </div>
  );
}

function SecurityItem({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <Shield className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );
}
