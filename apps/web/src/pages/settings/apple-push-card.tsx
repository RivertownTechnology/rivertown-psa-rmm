import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell } from 'lucide-react';

interface ApplePushConfig {
  isEnabled: boolean;
  hasKeyP8: boolean;
  keyId: string;
  teamId: string;
  bundleId: string;
}

export function ApplePushCard() {
  const [config, setConfig] = useState<ApplePushConfig>({ isEnabled: false, hasKeyP8: false, keyId: '', teamId: '', bundleId: '' });
  const [keyP8Input, setKeyP8Input] = useState('');
  const [keyIdInput, setKeyIdInput] = useState('');
  const [teamIdInput, setTeamIdInput] = useState('');
  const [bundleIdInput, setBundleIdInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<ApplePushConfig>('/settings/apple-push').then(cfg => {
      setConfig(cfg);
      // Never prefill the actual key ID or .p8 contents — masked/blank fields
      // in the form mean "leave unchanged" on save.
      setTeamIdInput(cfg.teamId);
      setBundleIdInput(cfg.bundleId);
    }).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/apple-push', {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled: config.isEnabled,
          keyP8: keyP8Input || undefined,
          keyId: keyIdInput || undefined,
          teamId: teamIdInput,
          bundleId: bundleIdInput,
        }),
      });
      setMessage('Apple Push settings saved');
      setKeyP8Input('');
      setKeyIdInput('');
      const updated = await api<ApplePushConfig>('/settings/apple-push');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Apple Push Notifications</CardTitle>
        <CardDescription>
          Sends push notifications to the iOS app when a new ticket is created or assigned. Get the .p8 key,
          Key ID, and Team ID from{' '}
          <a href="https://developer.apple.com/account/resources/authkeys/list" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            developer.apple.com
          </a>.
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
            <span className="text-sm font-medium">Enable Apple Push Notifications</span>
          </div>

          <div>
            <Label>Key ID</Label>
            <Input
              value={keyIdInput}
              onChange={e => setKeyIdInput(e.target.value)}
              placeholder={config.keyId || 'e.g. ABCD1234EF'}
            />
            {config.keyId && !keyIdInput && <p className="text-xs text-muted-foreground mt-1">Currently saved: {config.keyId}</p>}
          </div>

          <div>
            <Label>Team ID</Label>
            <Input
              value={teamIdInput}
              onChange={e => setTeamIdInput(e.target.value)}
              placeholder="Your Apple Developer Team ID"
            />
          </div>

          <div>
            <Label>Bundle ID</Label>
            <Input
              value={bundleIdInput}
              onChange={e => setBundleIdInput(e.target.value)}
              placeholder="com.forgepsa.app"
            />
            <p className="text-xs text-muted-foreground mt-1">The iOS app's bundle identifier — sent as the apns-topic header on every push.</p>
          </div>

          <div>
            <Label>.p8 Auth Key</Label>
            <textarea
              value={keyP8Input}
              onChange={e => setKeyP8Input(e.target.value)}
              placeholder={config.hasKeyP8 ? '•••••••• A key is already saved. Paste a new one to replace it.' : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {config.hasKeyP8 ? 'A key is already saved — leave blank to keep it.' : 'Paste the full contents of the downloaded .p8 file, including the BEGIN/END lines.'}
            </p>
          </div>

          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Apple Push Settings'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
