import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, CreditCard, Users, Loader2, Check, AlertCircle, Send, Calendar } from 'lucide-react';

interface SystemConfigs {
  mailjet?: Record<string, string>;
  stripe?: Record<string, string>;
}

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  planTier: 'starter' | 'pro' | 'enterprise';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  pastDueAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  userCount: number;
}

export function AdminPage() {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access denied</h1>
        <p className="text-muted-foreground">This area is restricted to ForgePSA super-admins.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">ForgePSA Admin</h1>
        <p className="text-muted-foreground">Platform-wide configuration and tenant management.</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">System integrations</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          <MailjetCard />
          <StripeCard />
        </TabsContent>

        <TabsContent value="tenants">
          <TenantsList />
        </TabsContent>
      </Tabs>
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
        const cfg = await api<SystemConfigs>('/admin/system-configs');
        const m = cfg.mailjet || {};
        setApiKey(m.apiKey as string ?? '');
        if (typeof m.apiSecret === 'string' && m.apiSecret.startsWith('•')) {
          setApiSecret('');
          setSecretMasked(true);
        }
        setFromEmail(m.fromEmail as string ?? '');
        setFromName(m.fromName as string ?? 'ForgePSA');
        setReplyTo(m.replyTo as string ?? '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { apiKey, fromEmail, fromName, replyTo };
      if (apiSecret) body.apiSecret = apiSecret;
      await api('/admin/system-configs/mailjet', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      setSecretMasked(true);
      setApiSecret('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true);
    setMsg(null);
    try {
      await api('/admin/system-configs/mailjet/test', {
        method: 'POST',
        body: JSON.stringify({ to: testTo }),
      });
      setMsg({ kind: 'ok', text: `Test email sent to ${testTo}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Test failed.' });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <CardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" /> System Mailjet
        </CardTitle>
        <CardDescription>
          Used for welcome emails, trial reminders, and billing notices from ForgePSA to your tenants.
          This is separate from each tenant's own email config.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mj-key">API Key</Label>
            <Input id="mj-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mj-secret">API Secret</Label>
            <Input
              id="mj-secret"
              type="password"
              placeholder={secretMasked ? 'Saved — leave blank to keep' : ''}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mj-from">From email</Label>
            <Input
              id="mj-from"
              type="email"
              placeholder="hello@forgepsa.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mj-fromname">From name</Label>
            <Input
              id="mj-fromname"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="ForgePSA"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="mj-reply">Reply-to (optional)</Label>
            <Input
              id="mj-reply"
              type="email"
              placeholder="support@forgepsa.com"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label>Send test email</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button variant="outline" onClick={sendTest} disabled={!testTo || testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send test
            </Button>
          </div>
        </div>

        {msg && <StatusLine {...msg} />}
      </CardContent>
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
        const cfg = await api<SystemConfigs>('/admin/system-configs');
        const s = cfg.stripe || {};
        setPublishableKey(s.publishableKey as string ?? '');
        setStarterPriceId(s.starterPriceId as string ?? '');
        setProPriceId(s.proPriceId as string ?? '');
        if (typeof s.secretKey === 'string' && s.secretKey.startsWith('•')) setSecretMasked(true);
        if (typeof s.webhookSecret === 'string' && s.webhookSecret.startsWith('•')) setWebhookMasked(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, string> = {
        publishableKey, starterPriceId, proPriceId,
      };
      if (secretKey) body.secretKey = secretKey;
      if (webhookSecret) body.webhookSecret = webhookSecret;
      await api('/admin/system-configs/stripe', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      if (secretKey) { setSecretMasked(true); setSecretKey(''); }
      if (webhookSecret) { setWebhookMasked(true); setWebhookSecret(''); }
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <CardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> System Stripe
        </CardTitle>
        <CardDescription>
          Used for ForgePSA's own subscription billing — charges tenants for their plan.
          Tenants still configure their own Stripe account separately to accept customer payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stripe-pk">Publishable key</Label>
            <Input
              id="stripe-pk"
              placeholder="pk_live_… or pk_test_…"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stripe-sk">Secret key</Label>
            <Input
              id="stripe-sk"
              type="password"
              placeholder={secretMasked ? 'Saved — leave blank to keep' : 'sk_live_…'}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stripe-wh">Webhook signing secret</Label>
            <Input
              id="stripe-wh"
              type="password"
              placeholder={webhookMasked ? 'Saved — leave blank to keep' : 'whsec_…'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stripe-starter">Starter Price ID</Label>
            <Input
              id="stripe-starter"
              placeholder="price_…"
              value={starterPriceId}
              onChange={(e) => setStarterPriceId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stripe-pro">Pro Price ID</Label>
            <Input
              id="stripe-pro"
              placeholder="price_…"
              value={proPriceId}
              onChange={(e) => setProPriceId(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>

        <p className="text-xs text-muted-foreground">
          Webhook endpoint: <code className="bg-muted px-1 rounded">https://api.forgepsa.com/api/v1/stripe/billing-webhook</code>
        </p>

        {msg && <StatusLine {...msg} />}
      </CardContent>
    </Card>
  );
}

function TenantsList() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await api<AdminTenant[]>('/admin/tenants');
      setTenants(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function extendTrial(tenantId: string, days: number) {
    setBusyId(tenantId);
    try {
      await api(`/admin/tenants/${tenantId}/extend-trial`, {
        method: 'POST',
        body: JSON.stringify({ days }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <CardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Tenants ({tenants.length})
        </CardTitle>
        <CardDescription>Every MSP signed up on ForgePSA.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Trial ends</th>
                <th className="pb-2 pr-4 font-medium">Users</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.slug}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{t.planTier}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={t.subscriptionStatus} />
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 pr-4">{t.userCount}</td>
                  <td className="py-3 text-right">
                    {t.subscriptionStatus === 'trial' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === t.id}
                        onClick={() => extendTrial(t.id, 30)}
                      >
                        <Calendar className="h-3.5 w-3.5 mr-1" />
                        +30 days
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No tenants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AdminTenant['subscriptionStatus'] }) {
  const cls = {
    trial: 'bg-blue-100 text-blue-800 border-blue-200',
    active: 'bg-green-100 text-green-800 border-green-200',
    past_due: 'bg-amber-100 text-amber-800 border-amber-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  }[status];
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{status.replace('_', ' ')}</span>;
}

function StatusLine({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <div
      className={`flex items-start gap-2 text-sm p-3 rounded-md ${
        kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-destructive/10 text-destructive'
      }`}
    >
      {kind === 'ok' ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading…
      </CardContent>
    </Card>
  );
}
