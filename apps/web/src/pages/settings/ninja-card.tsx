import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor } from 'lucide-react';

export function NinjaOneCard() {
  const [config, setConfig] = useState({ isEnabled: false, clientId: '', clientSecret: '', region: 'us' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/ninjaone').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/ninjaone', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('NinjaOne settings saved');
      const updated = await api<typeof config>('/settings/ninjaone');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />NinjaOne (NinjaRMM)</CardTitle>
        <CardDescription>Sync devices, alerts, and organizations from NinjaOne. Get API credentials in NinjaOne: Administration → Apps → API.</CardDescription>
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
            <span className="text-sm font-medium">Enable NinjaOne Integration</span>
          </div>
          <div>
            <Label>Region</Label>
            <select value={config.region} onChange={e => setConfig(c => ({ ...c, region: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="us">US (app.ninjarmm.com)</option>
              <option value="us2">US2 (us2.ninjarmm.com)</option>
              <option value="eu">EU (eu.ninjarmm.com)</option>
              <option value="ca">Canada (ca.ninjarmm.com)</option>
              <option value="oc">Oceania (oc.ninjarmm.com)</option>
            </select>
          </div>
          <div>
            <Label>Client ID</Label>
            <Input value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))} placeholder="Your NinjaOne API client ID" />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input type="password" value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))} placeholder="Your NinjaOne API client secret" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save NinjaOne Settings'}</Button>
          <p className="text-xs text-muted-foreground">Credentials stored encrypted. Device sync is available — configure and enable to start syncing assets.</p>
        </form>
      </CardContent>
    </Card>
  );
}
