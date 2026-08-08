import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, Send } from 'lucide-react';

interface ApplePushConfig {
  isEnabled: boolean;
  hasKeyP8: boolean;
  keyId: string;
  teamId: string;
  bundleId: string;
}

interface DeviceUser {
  userId: string;
  displayName: string;
  deviceCount: number;
  environments: string[];
}

interface TestPushResult {
  userId: string;
  displayName: string;
  deviceCount: number;
  sent: number;
  errors: Array<{ token: string; reason: string }>;
}

export function ApplePushCard() {
  const [config, setConfig] = useState<ApplePushConfig>({ isEnabled: false, hasKeyP8: false, keyId: '', teamId: '', bundleId: '' });
  const [keyP8Input, setKeyP8Input] = useState('');
  const [keyIdInput, setKeyIdInput] = useState('');
  const [teamIdInput, setTeamIdInput] = useState('');
  const [bundleIdInput, setBundleIdInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [testTarget, setTestTarget] = useState('self');
  const [testType, setTestType] = useState<'ticket_created' | 'ticket_assigned'>('ticket_created');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestPushResult[] | null>(null);
  const [testError, setTestError] = useState('');

  function loadDevices() {
    api<{ totalDevices: number; users: DeviceUser[] }>('/settings/apple-push/devices')
      .then(res => { setDeviceUsers(res.users); setTotalDevices(res.totalDevices); })
      .catch(() => {});
  }

  useEffect(() => {
    api<ApplePushConfig>('/settings/apple-push').then(cfg => {
      setConfig(cfg);
      // Never prefill the actual key ID or .p8 contents — masked/blank fields
      // in the form mean "leave unchanged" on save.
      setTeamIdInput(cfg.teamId);
      setBundleIdInput(cfg.bundleId);
    }).catch(() => {});
    loadDevices();
  }, []);

  async function handleSendTest() {
    setTesting(true); setTestError(''); setTestResults(null);
    try {
      const res = await api<{ success: boolean; message?: string; results: TestPushResult[] }>('/settings/apple-push/test', {
        method: 'POST',
        body: JSON.stringify({ target: testTarget, type: testType }),
      });
      if (!res.success) setTestError(res.message || 'No devices to send to');
      setTestResults(res.results);
      // A stale/rejected token gets pruned server-side on a bad response —
      // refresh so the device count here reflects that.
      loadDevices();
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTesting(false);
    }
  }

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

        <div className="mt-8 pt-6 border-t">
          <h4 className="text-sm font-semibold mb-1">Send Test Push</h4>
          <p className="text-xs text-muted-foreground mb-4">
            Sends a real push right now using your saved credentials (save any changes above first) and shows Apple's response per device immediately, instead of waiting on a real ticket event.
          </p>

          {totalDevices === 0 ? (
            <p className="text-sm text-muted-foreground">
              No devices registered yet — install the iOS app and sign in on at least one device before testing.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label>Send to</Label>
                  <select
                    value={testTarget}
                    onChange={e => setTestTarget(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="self">Just me</option>
                    <option value="all">Everyone with a device ({totalDevices} device{totalDevices === 1 ? '' : 's'} / {deviceUsers.length} user{deviceUsers.length === 1 ? '' : 's'})</option>
                    {deviceUsers.map(u => (
                      <option key={u.userId} value={u.userId}>{u.displayName} ({u.deviceCount} device{u.deviceCount === 1 ? '' : 's'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Notification type</Label>
                  <select
                    value={testType}
                    onChange={e => setTestType(e.target.value as 'ticket_created' | 'ticket_assigned')}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="ticket_created">New ticket</option>
                    <option value="ticket_assigned">Ticket assigned</option>
                  </select>
                </div>

                <Button type="button" variant="outline" onClick={handleSendTest} disabled={testing}>
                  <Send className="h-4 w-4 mr-1" />{testing ? 'Sending...' : 'Send Test'}
                </Button>
              </div>

              {testError && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{testError}</div>
              )}

              {testResults && testResults.length > 0 && (
                <div className="space-y-2">
                  {testResults.map(r => (
                    <div key={r.userId} className="text-sm border rounded-md p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.displayName}</span>
                        <span className={r.sent === r.deviceCount ? 'text-green-600' : r.sent > 0 ? 'text-amber-600' : 'text-red-600'}>
                          {r.sent}/{r.deviceCount} delivered
                        </span>
                      </div>
                      {r.errors.length > 0 && (
                        <ul className="mt-1 text-xs text-red-600 space-y-0.5">
                          {r.errors.map((e, i) => (
                            <li key={i}>{e.token}: {e.reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
