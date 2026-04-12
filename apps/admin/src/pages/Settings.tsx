import { useEffect, useState } from 'react';
import { Mail, CreditCard, Send, Check, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface Configs {
  mailjet?: Record<string, string>;
  stripe?: Record<string, string>;
}

export function SettingsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">System settings</h1>
      <p className="text-slate-400 mb-6">Platform-level integrations used across every tenant.</p>

      <div className="space-y-4">
        <MailjetCard />
        <StripeCard />
      </div>
    </div>
  );
}

function MailjetCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [testTo, setTestTo] = useState('');
  const [secretMasked, setSecretMasked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api<Configs>('/admin/system-configs');
        const m = cfg.mailjet || {};
        setApiKey(m.apiKey as string ?? '');
        if (typeof m.apiSecret === 'string' && m.apiSecret.startsWith('•')) setSecretMasked(true);
        setFromEmail(m.fromEmail as string ?? '');
        setFromName(m.fromName as string ?? 'ForgePSA');
        setReplyTo(m.replyTo as string ?? '');
      } finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, string> = { apiKey, fromEmail, fromName, replyTo };
      if (apiSecret) body.apiSecret = apiSecret;
      await api('/admin/system-configs/mailjet', { method: 'PUT', body: JSON.stringify(body) });
      setMsg({ kind: 'ok', text: 'Saved.' });
      if (apiSecret) { setSecretMasked(true); setApiSecret(''); }
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally { setSaving(false); }
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true); setMsg(null);
    try {
      await api('/admin/system-configs/mailjet/test', {
        method: 'POST',
        body: JSON.stringify({ to: testTo }),
      });
      setMsg({ kind: 'ok', text: `Test email sent to ${testTo}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Test failed.' });
    } finally { setTesting(false); }
  }

  if (loading) return <Card><LoadingRow /></Card>;

  return (
    <Card>
      <CardHeader icon={<Mail className="h-5 w-5" />} title="Mailjet" desc="System email — welcome messages, trial reminders, payment notices." />
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <DarkField label="API key">
          <DarkInput value={apiKey} onChange={setApiKey} />
        </DarkField>
        <DarkField label="API secret">
          <DarkInput type="password" value={apiSecret} onChange={setApiSecret} placeholder={secretMasked ? 'Saved — leave blank to keep' : ''} />
        </DarkField>
        <DarkField label="From email">
          <DarkInput type="email" value={fromEmail} onChange={setFromEmail} placeholder="hello@forgepsa.com" />
        </DarkField>
        <DarkField label="From name">
          <DarkInput value={fromName} onChange={setFromName} placeholder="ForgePSA" />
        </DarkField>
        <DarkField label="Reply-to (optional)" className="md:col-span-2">
          <DarkInput type="email" value={replyTo} onChange={setReplyTo} placeholder="support@forgepsa.com" />
        </DarkField>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>

      <div className="border-t border-slate-800 mt-5 pt-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Send test email</label>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            className="flex-1 px-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-sm text-white"
          />
          <button
            onClick={sendTest}
            disabled={!testTo || testing}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 disabled:opacity-40"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test
          </button>
        </div>
      </div>

      {msg && <StatusLine {...msg} />}
    </Card>
  );
}

function StripeCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [starterPriceId, setStarterPriceId] = useState('');
  const [proPriceId, setProPriceId] = useState('');
  const [secretMasked, setSecretMasked] = useState(false);
  const [webhookMasked, setWebhookMasked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api<Configs>('/admin/system-configs');
        const s = cfg.stripe || {};
        setPublishableKey(s.publishableKey as string ?? '');
        setStarterPriceId(s.starterPriceId as string ?? '');
        setProPriceId(s.proPriceId as string ?? '');
        if (typeof s.secretKey === 'string' && s.secretKey.startsWith('•')) setSecretMasked(true);
        if (typeof s.webhookSecret === 'string' && s.webhookSecret.startsWith('•')) setWebhookMasked(true);
      } finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, string> = { publishableKey, starterPriceId, proPriceId };
      if (secretKey) body.secretKey = secretKey;
      if (webhookSecret) body.webhookSecret = webhookSecret;
      await api('/admin/system-configs/stripe', { method: 'PUT', body: JSON.stringify(body) });
      setMsg({ kind: 'ok', text: 'Saved.' });
      if (secretKey) { setSecretMasked(true); setSecretKey(''); }
      if (webhookSecret) { setWebhookMasked(true); setWebhookSecret(''); }
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally { setSaving(false); }
  }

  if (loading) return <Card><LoadingRow /></Card>;

  return (
    <Card>
      <CardHeader
        icon={<CreditCard className="h-5 w-5" />}
        title="Stripe"
        desc="Platform billing — the Stripe account ForgePSA uses to charge its tenants."
      />

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <DarkField label="Publishable key" className="md:col-span-2">
          <DarkInput value={publishableKey} onChange={setPublishableKey} placeholder="pk_live_… or pk_test_…" />
        </DarkField>
        <DarkField label="Secret key">
          <DarkInput type="password" value={secretKey} onChange={setSecretKey} placeholder={secretMasked ? 'Saved — leave blank to keep' : 'sk_live_…'} />
        </DarkField>
        <DarkField label="Webhook signing secret">
          <DarkInput type="password" value={webhookSecret} onChange={setWebhookSecret} placeholder={webhookMasked ? 'Saved — leave blank to keep' : 'whsec_…'} />
        </DarkField>
        <DarkField label="Starter Price ID">
          <DarkInput value={starterPriceId} onChange={setStarterPriceId} placeholder="price_…" />
        </DarkField>
        <DarkField label="Pro Price ID">
          <DarkInput value={proPriceId} onChange={setProPriceId} placeholder="price_…" />
        </DarkField>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md inline-flex items-center gap-2 mb-3"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save
      </button>

      <p className="text-xs text-slate-500">
        Webhook endpoint: <code className="bg-slate-950 px-1.5 py-0.5 rounded font-mono">https://api.forgepsa.com/api/v1/stripe/billing-webhook</code>
      </p>

      {msg && <StatusLine {...msg} />}
    </Card>
  );
}

/* ---- Dark-theme primitives ---- */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">{children}</div>;
}

function CardHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-800">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-slate-800 text-brand-400 shrink-0">{icon}</div>
      <div>
        <div className="text-base font-semibold text-white">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

function DarkField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DarkInput({
  value, onChange, type = 'text', placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 outline-none text-sm text-white placeholder:text-slate-600"
    />
  );
}

function StatusLine({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <div
      className={`mt-4 flex items-start gap-2 text-sm p-3 rounded-md ${
        kind === 'ok'
          ? 'bg-emerald-900/20 border border-emerald-900/50 text-emerald-200'
          : 'bg-red-900/20 border border-red-900/50 text-red-200'
      }`}
    >
      {kind === 'ok' ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
    </div>
  );
}
