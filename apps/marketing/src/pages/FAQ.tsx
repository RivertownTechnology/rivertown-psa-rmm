import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

type FAQItem = { q: string; a: React.ReactNode };

type Section = { title: string; items: FAQItem[] };

const SECTIONS: Section[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How long does signup take?',
        a: 'About 2 minutes. You create your account, we create your tenant, and you\'re inside the dashboard. No sales call, no credit card.',
      },
      {
        q: 'Do I need a credit card for the trial?',
        a: 'No. The 45-day free trial requires nothing but an email address and a password.',
      },
      {
        q: 'What happens after the 45-day trial?',
        a: 'Your account enters read-only mode — you can still log in, export data, and add a subscription to re-activate writes. We never delete tenant data during the grace period.',
      },
      {
        q: 'Can I import data from ConnectWise, Halo, or Autotask?',
        a: 'Contact support@forgepsa.com — we have CSV import tools for customers, contacts, sites, and assets. Historical tickets are imported on a best-effort basis.',
      },
    ],
  },
  {
    title: 'Pricing & billing',
    items: [
      {
        q: 'How does per-tech billing work?',
        a: 'You\'re billed monthly for each active user with an "owner", "admin", or "tech" role. Portal users (your customers who log in to see their tickets/invoices) are always free and unlimited.',
      },
      {
        q: 'Can I change plans later?',
        a: 'Yes — upgrade or downgrade at any time from billing settings. Changes prorate automatically.',
      },
      {
        q: 'Do you offer annual discounts?',
        a: 'Yes — 15% off for annual prepay. Available on all plans at checkout.',
      },
      {
        q: 'What happens if my payment fails?',
        a: 'You get a 30-day grace period where the app still works normally. After 30 days without a successful payment, your account locks to the billing screen until you update your card. No data is ever deleted.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. No long-term contracts, no cancellation fees. Cancel from the Stripe customer portal linked in your billing settings.',
      },
    ],
  },
  {
    title: 'Integrations',
    items: [
      {
        q: 'Which accounting software do you integrate with?',
        a: 'QuickBooks Online (two-way sync of customers, invoices, payments). QuickBooks Desktop via Web Connector is on the roadmap.',
      },
      {
        q: 'What RMM platforms do you integrate with?',
        a: 'NinjaRMM today. N-able N-central and Datto RMM coming in Q3 2026.',
      },
      {
        q: 'Can I use my own Stripe account?',
        a: 'Yes. Your tenant has its own Stripe configuration for charging your customers. It\'s entirely separate from the Stripe ForgePSA uses to bill you.',
      },
      {
        q: 'What email providers are supported?',
        a: 'Google Workspace (OAuth), SMTP (any provider), and Mailjet for transactional billing email. Customer replies thread automatically back into the original ticket.',
      },
      {
        q: 'Do you integrate with Pax8?',
        a: 'Yes. Product sync, cost tracking, gross-margin reporting, and automatic recurring billing from Pax8 subscriptions.',
      },
    ],
  },
  {
    title: 'Security & data',
    items: [
      {
        q: 'How is my data protected?',
        a: 'All data is encrypted in transit (TLS 1.2+) and at rest. Integration credentials (QuickBooks, Stripe, Pax8, Mailjet) are encrypted with AES-256-GCM. Passwords are hashed with bcrypt.',
      },
      {
        q: 'Where is my data hosted?',
        a: 'United States (AWS us-east via Railway). Contact us if you need EU or UK data residency — available on Enterprise plans.',
      },
      {
        q: 'Do you use my data to train AI?',
        a: 'No. Your Customer Data is never used to train AI models. Our AI features use Anthropic Claude with redacted prompts and explicit consent.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes, at any time. CSV export from each module (customers, tickets, invoices) and full database dump available on request.',
      },
      {
        q: 'What happens to my data if I cancel?',
        a: 'You have 30 days to export everything. After that, we remove from active systems within 90 days. Backups age out naturally within another 90 days.',
      },
    ],
  },
  {
    title: 'Migration & support',
    items: [
      {
        q: 'Is there a migration fee?',
        a: 'No setup fees, no migration fees, ever. On Pro and Enterprise plans we\'ll help you import from your previous PSA at no charge.',
      },
      {
        q: 'What support is included?',
        a: 'Email support on all plans. Priority email + chat on Pro. Named CSM on Enterprise. No charge for any of this.',
      },
      {
        q: 'Where\'s your documentation?',
        a: 'Our full knowledge base, API docs, and ticket submission live behind login in the support portal — sign in to your account and click Help.',
      },
    ],
  },
];

export function FAQ({ navigate }: { navigate: (p: string) => void }) {
  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700 mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Questions we hear a lot
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Frequently asked questions
          </h1>
          <p className="text-xl text-slate-600">
            Can't find what you're looking for?{' '}
            <button onClick={() => navigate('/support')} className="text-brand-600 hover:text-brand-700 font-semibold">
              Visit our support portal
            </button>
            {' '}or{' '}
            <a href="mailto:support@forgepsa.com" className="text-brand-600 hover:text-brand-700 font-semibold">
              email support
            </a>.
          </p>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-xl font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <Accordion key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Still have questions?</h2>
          <p className="text-lg text-slate-600 mb-8">
            Start the trial and try it yourself, or talk to us first.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
            >
              Start your free trial
            </button>
            <a
              href="mailto:hello@forgepsa.com"
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function Accordion({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-900">{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-slate-600 leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}
