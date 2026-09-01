import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Mail, Send } from 'lucide-react';

interface Sender { fromAddress: string; fromName: string; replyTo: string }
interface MailjetConfig {
  isEnabled: boolean; apiKey: string; secretKey: string;
  senders: Record<string, Sender>;
}

const CHANNELS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'default', label: 'Default', hint: 'Used for any document type without its own sender below' },
  { key: 'quotes', label: 'Quotes', hint: 'Quote emails and quote PDFs' },
  { key: 'agreements', label: 'Agreements & MSAs', hint: 'Signature requests, renewals, signed copies' },
  { key: 'invoices', label: 'Invoices', hint: 'Invoice sends (manual and contract auto-send)' },
  { key: 'receipts', label: 'Receipts', hint: 'Payment confirmation emails' },
];

const emptySender = (): Sender => ({ fromAddress: '', fromName: '', replyTo: '' });

export function MailjetCard() {
  const [config, setConfig] = useState<MailjetConfig>({
    isEnabled: false, apiKey: '', secretKey: '',
    senders: Object.fromEntries(CHANNELS.map(c => [c.key, emptySender()])),
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testChannel, setTestChannel] = useState('invoices');

  useEffect(() => {
    api<MailjetConfig>('/settings/mailjet').then(d => setConfig(c => ({
      ...c, ...d,
      senders: Object.fromEntries(CHANNELS.map(ch => [ch.key, { ...emptySender(), ...(d.senders?.[ch.key] ?? {}) }])),
    }))).catch(() => {});
  }, []);

  function setSender(key: string, field: keyof Sender, value: string) {
    setConfig(c => ({ ...c, senders: { ...c.senders, [key]: { ...c.senders[key], [field]: value } } }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/mailjet', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('Mailjet settings saved');
      const updated = await api<MailjetConfig>('/settings/mailjet');
      setConfig(c => ({
        ...c, ...updated,
        senders: Object.fromEntries(CHANNELS.map(ch => [ch.key, { ...emptySender(), ...(updated.senders?.[ch.key] ?? {}) }])),
      }));
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/mailjet/test', {
        method: 'POST', body: JSON.stringify({ email: testEmail || undefined, channel: testChannel }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Mailjet (Unified)</CardTitle>
        <CardDescription>
          One Mailjet API credential for all outbound documents, with a different from-address per document type.
          When enabled, this takes precedence over the separate Billing Email and Sales Email configs (those remain
          as fallback for any type without a sender here). Every from-address must be a verified sender in Mailjet.
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
            <span className="text-sm font-medium">Enable unified Mailjet sending</span>
          </div>

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

          <Separator />

          <div className="space-y-4">
            {CHANNELS.map(ch => (
              <div key={ch.key} className="rounded-lg border p-3">
                <div className="mb-2">
                  <span className="text-sm font-medium">{ch.label}</span>
                  <p className="text-xs text-muted-foreground">{ch.hint}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">From Address</Label>
                    <Input value={config.senders[ch.key]?.fromAddress ?? ''} onChange={e => setSender(ch.key, 'fromAddress', e.target.value)}
                      placeholder={ch.key === 'default' ? 'office@rivertowntechnology.com' : `${ch.key}@rivertowntechnology.com`} />
                  </div>
                  <div>
                    <Label className="text-xs">From Name</Label>
                    <Input value={config.senders[ch.key]?.fromName ?? ''} onChange={e => setSender(ch.key, 'fromName', e.target.value)}
                      placeholder="Rivertown Technology" />
                  </div>
                  <div>
                    <Label className="text-xs">Reply-To (optional)</Label>
                    <Input value={config.senders[ch.key]?.replyTo ?? ''} onChange={e => setSender(ch.key, 'replyTo', e.target.value)}
                      placeholder="Same as from address" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Mailjet Settings'}</Button>
            <div className="flex items-center gap-2">
              <Select value={testChannel} onValueChange={setTestChannel}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.filter(c => c.key !== 'default').map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
