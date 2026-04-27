import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Smile } from 'lucide-react';

export function CrewHuCard() {
  const [config, setConfig] = useState({ isEnabled: false, apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/crewhu').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/crewhu', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('CrewHu settings saved');
      const updated = await api<typeof config>('/settings/crewhu');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smile className="h-5 w-5" />CrewHu (CSAT)</CardTitle>
        <CardDescription>Customer satisfaction surveys for closed tickets. Get your API key from <a href="https://get-help-tnt.crewhu.com/hc/en-us/articles/360002286094-Open-API" target="_blank" rel="noopener noreferrer" className="text-primary underline">CrewHu Open API docs</a>.</CardDescription>
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
            <span className="text-sm font-medium">Enable CrewHu CSAT</span>
          </div>
          <div>
            <Label>API Key</Label>
            <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Your CrewHu API key" />
            <p className="text-xs text-muted-foreground mt-1">In CrewHu: Settings → Integrations → Open API. Copy the API key.</p>
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save CrewHu Settings'}</Button>
          <p className="text-xs text-muted-foreground">Built-in CSAT ratings are active — smiley faces appear in resolved ticket emails automatically. CrewHU integration provides additional survey capabilities.</p>
        </form>
      </CardContent>
    </Card>
  );
}
