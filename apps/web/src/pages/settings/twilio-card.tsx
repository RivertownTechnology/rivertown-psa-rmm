import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send } from 'lucide-react';

export function TwilioCard() {
  const [config, setConfig] = useState({ isEnabled: false, accountSid: '', authToken: '', fromNumber: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/twilio').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/twilio', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('Twilio settings saved');
      const updated = await api<typeof config>('/settings/twilio');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/twilio/test', {
        method: 'POST', body: JSON.stringify({ phone: testPhone }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Twilio (SMS MFA)</CardTitle>
        <CardDescription>Send SMS verification codes for portal user MFA. Get credentials at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.twilio.com</a>.</CardDescription>
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
            <span className="text-sm font-medium">Enable Twilio SMS</span>
          </div>
          <div>
            <Label>Account SID</Label>
            <Input value={config.accountSid} onChange={e => setConfig(c => ({ ...c, accountSid: e.target.value }))} placeholder="AC..." />
          </div>
          <div>
            <Label>Auth Token</Label>
            <Input type="password" value={config.authToken} onChange={e => setConfig(c => ({ ...c, authToken: e.target.value }))} placeholder="Your auth token" />
          </div>
          <div>
            <Label>From Number (E.164 format)</Label>
            <Input value={config.fromNumber} onChange={e => setConfig(c => ({ ...c, fromNumber: e.target.value }))} placeholder="+18435551234" />
            <p className="text-xs text-muted-foreground mt-1">Must be a phone number purchased from your Twilio account, including the + and country code.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Twilio Settings'}</Button>
            <div className="flex items-center gap-2">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Test phone #" className="w-40" />
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !testPhone}>
                <Send className="h-4 w-4 mr-1" />{testing ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
