import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mail, Send } from 'lucide-react';

interface EnvFallback { tenantId: boolean; clientId: boolean; clientSecret: boolean }
interface MicrosoftEmailConfig {
  isEnabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxes: string[];
  fromAddress: string;
  fromName: string;
  envFallback?: EnvFallback;
}

const empty: MicrosoftEmailConfig = {
  isEnabled: false, tenantId: '', clientId: '', clientSecret: '',
  mailboxes: [], fromAddress: '', fromName: '',
};

export function MicrosoftEmailCard() {
  const [config, setConfig] = useState<MicrosoftEmailConfig>(empty);
  const [mailboxText, setMailboxText] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');

  function load() {
    api<MicrosoftEmailConfig>('/settings/microsoft-email').then(d => {
      setConfig({ ...empty, ...d, mailboxes: d.mailboxes ?? [] });
      setMailboxText((d.mailboxes ?? []).join('\n'));
    }).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      const mailboxes = mailboxText.split(/[\n,]+/).map(m => m.trim()).filter(Boolean);
      await api('/settings/microsoft-email', {
        method: 'PUT',
        body: JSON.stringify({ ...config, mailboxes }),
      });
      setMessage('Microsoft 365 email settings saved');
      load();
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/microsoft-email/test', {
        method: 'POST', body: JSON.stringify({ email: testEmail || undefined }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  const env = config.envFallback;

  return (
    <Card className={config.isEnabled ? 'border-blue-300 dark:border-blue-800' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 23 23" className="h-5 w-5"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
          Microsoft 365 Email
        </CardTitle>
        <CardDescription>
          App-only (client-credentials) sending and inbound email-to-ticket via Microsoft Graph.
          Requires an Entra app registration with the <strong>Mail.Send</strong> and <strong>Mail.ReadWrite</strong>
          {' '}application permissions (admin-consented). When enabled, this becomes the active send/receive
          provider. Tenant ID, client ID, and client secret fall back to the MS_* server environment variables
          when left blank — you can enter just the mailbox addresses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable Microsoft 365 email (send &amp; receive)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Directory (tenant) ID</Label>
              <Input value={config.tenantId} onChange={e => setConfig(c => ({ ...c, tenantId: e.target.value }))}
                placeholder={env?.tenantId ? 'Using MS_TENANT_ID env' : '00000000-0000-0000-0000-000000000000'} />
            </div>
            <div>
              <Label>Application (client) ID</Label>
              <Input value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))}
                placeholder={env?.clientId ? 'Using MS_CLIENT_ID env' : 'Application (client) ID'} />
            </div>
          </div>

          <div>
            <Label>Client secret</Label>
            <Input type="password" value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))}
              placeholder={env?.clientSecret ? 'Using MS_CLIENT_SECRET env (leave blank to keep)' : 'Client secret value'} />
          </div>

          <Separator />

          <div>
            <Label>Mailbox addresses (one per line)</Label>
            <textarea rows={3} value={mailboxText} onChange={e => setMailboxText(e.target.value)}
              placeholder={'support@yourcompany.com\nhelpdesk@yourcompany.com'}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" spellCheck={false} />
            <p className="text-xs text-muted-foreground mt-1">
              Every mailbox listed here is polled for inbound email-to-ticket. The from-address below (or the first
              mailbox) is used to send outbound email.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Default from address</Label>
              <Input value={config.fromAddress} onChange={e => setConfig(c => ({ ...c, fromAddress: e.target.value }))}
                placeholder="support@yourcompany.com" />
            </div>
            <div>
              <Label>From name</Label>
              <Input value={config.fromName} onChange={e => setConfig(c => ({ ...c, fromName: e.target.value }))}
                placeholder="Rivertown Technology" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Microsoft Email Settings'}</Button>
            <div className="flex items-center gap-2">
              <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="w-48" />
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                <Send className="h-4 w-4 mr-1" />{testing ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
