import { BookOpen, Code2, MessageSquare, Lock, Mail, LifeBuoy } from 'lucide-react';

export function Support({ navigate }: { navigate: (p: string) => void }) {
  const appUrl = (import.meta as any).env?.VITE_APP_URL ?? 'https://app.forgepsa.com';

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-6 mx-auto">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Support &amp; documentation
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Our knowledge base, API docs, and ticket submission are available to active customers.
            Sign in to access everything.
          </p>
        </div>
      </section>

      {/* Sign-in gate */}
      <section className="py-12 bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 mb-4">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Sign in for full access</h2>
            <p className="text-slate-600 mb-6">
              The support portal is available to anyone with a ForgePSA account —
              trial, active, or past customer. Sign in with your existing credentials.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`${appUrl}/support`}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg shadow-brand-600/20"
              >
                Sign in to Support
              </a>
              <button
                onClick={() => navigate('/signup')}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Don't have an account? Start free
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* What's inside */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-10">
            What's inside the support portal
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <PortalCard
              icon={<BookOpen />}
              title="Knowledge base"
              desc="Step-by-step guides for every feature — tickets, contracts, integrations, the customer portal, and more. Search or browse by module."
            />
            <PortalCard
              icon={<Code2 />}
              title="API documentation"
              desc="Full REST API reference with authentication, rate limits, endpoints, and worked examples. For anyone building integrations or automations."
            />
            <PortalCard
              icon={<MessageSquare />}
              title="Submit a ticket"
              desc="Report bugs, request features, or ask questions. Your conversation history is saved and searchable. Our team replies in one business day."
            />
          </div>
        </div>
      </section>

      {/* Emergency contact */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 border border-slate-200">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">Urgent issue and can't sign in?</h3>
                <p className="text-slate-600 mb-3">
                  Email <a href="mailto:support@forgepsa.com" className="text-brand-600 hover:underline font-semibold">support@forgepsa.com</a> from the email address on your account.
                  We respond to production-down issues 24/7.
                </p>
                <p className="text-sm text-slate-500">
                  Billing questions? <a href="mailto:billing@forgepsa.com" className="text-brand-600 hover:underline">billing@forgepsa.com</a> — one business day response.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Have a sales question instead?</h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/faq')}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Read the FAQ
            </button>
            <a
              href="mailto:hello@forgepsa.com"
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Email sales
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function PortalCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-all">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}
