import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { BadgeDollarSign, Send } from 'lucide-react';

export function SalesEmailCard() {
  const [config, setConfig] = useState({
    isEnabled: false, smtpHost: 'in-v3.mailjet.com', smtpPort: 587,
    apiKey: '', secretKey: '', fromAddress: '', fromName: '', replyTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/sales-email').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/sales-email', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('Sales email settings saved');
      const updated = await api<typeof config>('/settings/sales-email');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/sales-email/test', {
        method: 'POST', body: JSON.stringify({ email: testEmail || undefined }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-5 w-5" />Sales Email (Mailjet)</CardTitle>
        <CardDescription>Configure the email used for quotes, agreements, and MSAs. When disabled or unconfigured, sales documents fall back to the Billing Email settings.</CardDescription>
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
            <span className="text-sm font-medium">Enable sales email</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>From Address</Label>
              <Input value={config.fromAddress} onChange={e => setConfig(c => ({ ...c, fromAddress: e.target.value }))} placeholder="sales@rivertowntechnology.com" />
            </div>
            <div>
              <Label>From Name</Label>
              <Input value={config.fromName} onChange={e => setConfig(c => ({ ...c, fromName: e.target.value }))} placeholder="Rivertown Technology" />
            </div>
          </div>

          <div>
            <Label>Reply-To Address</Label>
            <Input value={config.replyTo} onChange={e => setConfig(c => ({ ...c, replyTo: e.target.value }))} placeholder="sales@rivertowntechnology.com (shared mailbox)" />
            <p className="text-xs text-muted-foreground mt-1">Customer replies will go to this address</p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mailjet API Key</Label>
              <Input value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Mailjet API Key" />
            </div>
            <div>
              <Label>Mailjet Secret Key</Label>
              <Input type="password" value={config.secretKey} onChange={e => setConfig(c => ({ ...c, secretKey: e.target.value }))} placeholder="Mailjet Secret Key" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Sales Email Settings'}</Button>
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
