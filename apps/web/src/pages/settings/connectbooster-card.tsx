import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign } from 'lucide-react';

export function ConnectBoosterCard() {
  const [config, setConfig] = useState({ isEnabled: false, apiKey: '', merchantId: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/connectbooster').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/connectbooster', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('ConnectBooster settings saved');
      const updated = await api<typeof config>('/settings/connectbooster');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />ConnectBooster</CardTitle>
        <CardDescription>MSP-focused payment processor with QuickBooks sync. Get credentials from your ConnectBooster account rep.</CardDescription>
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
            <span className="text-sm font-medium">Enable ConnectBooster</span>
          </div>
          <div>
            <Label>Merchant ID</Label>
            <Input value={config.merchantId} onChange={e => setConfig(c => ({ ...c, merchantId: e.target.value }))} placeholder="Your ConnectBooster merchant ID" />
          </div>
          <div>
            <Label>API Key</Label>
            <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Your API key" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save ConnectBooster Settings'}</Button>
          <p className="text-xs text-muted-foreground">Payment processor integration. Credentials are stored encrypted. Contact support to activate.</p>
        </form>
      </CardContent>
    </Card>
  );
}
