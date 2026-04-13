import { useState } from 'react';
import { Calendar, Mail, MessageSquare, Users, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Demo({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Book a demo — ForgePSA',
    'Book a 20-minute walkthrough of ForgePSA with someone who actually runs an MSP. Or skip the call and start your 45-day free trial.',
  );

  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', company: '', techs: '', notes: '' });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Simple mailto handoff — no backend required for the demo page.
    const body = encodeURIComponent(
      `Name: ${form.name}\nCompany: ${form.company}\nTechs: ${form.techs}\n\nNotes:\n${form.notes}`,
    );
    window.location.href = `mailto:sales@forgepsa.com?subject=${encodeURIComponent(
      `Demo request — ${form.company || form.name}`,
    )}&body=${body}`;
    setSent(true);
  }

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            20-minute walkthrough
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            Want a human to walk you through it?
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            Talk to an operator, not a BDR. We'll show you the screens that matter for your shop —
            ticketing, billing, Pax8 margins, NinjaRMM sync, whatever you want to see.
          </p>
        </div>
      </section>

      <section className="py-12 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-2">
          {/* Skip the demo */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 mb-4">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Or skip the call entirely.</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-5">
              Start your 45-day trial right now. No card, no sales follow-up. We'll only reach out if
              you ask us to.
            </p>
            <button
              onClick={() => navigate('/signup')}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow"
            >
              Start 45-day free trial
            </button>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Most MSP owners self-serve and never book a demo. That's fine by us.
            </div>
          </div>

          {/* Demo form */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 mb-4">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Book a walkthrough.</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Fill this out and we'll reply within one business day with a calendar link. Honest heads-up:
              we don't have a BDR team. It'll be an operator.
            </p>

            {sent ? (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">Email draft opened.</div>
                  <div>If your email client didn't open, just send us a note at{' '}
                    <a href="mailto:sales@forgepsa.com" className="underline">sales@forgepsa.com</a>.
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="Work email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
                <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
                <Field label="Techs on your team" value={form.techs} onChange={(v) => setForm({ ...form, techs: v })} placeholder="e.g. 8" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    What would you like to see? (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Current PSA, what's not working, what you'd want to validate in the demo."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow"
                >
                  Send demo request
                </button>
              </form>
            )}

            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Prefer direct email? <a href="mailto:sales@forgepsa.com" className="text-brand-600 dark:text-brand-400 hover:underline ml-1">sales@forgepsa.com</a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            Have a sales question instead?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Email <a href="mailto:hello@forgepsa.com" className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">hello@forgepsa.com</a> or
            check the <button onClick={() => navigate('/faq')} className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">FAQ</button>.
          </p>
        </div>
      </section>
    </>
  );
}

function Field({
  label, value, onChange, type = 'text', required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
