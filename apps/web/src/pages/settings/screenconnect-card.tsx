import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Monitor, CheckCircle } from 'lucide-react';

export function ScreenConnectCard() {
  const [scConfig, setScConfig] = useState({
    isEnabled: false,
    serverUrl: 'https://rivertowntechnology.screenconnect.com',
    username: '',
    password: '',
    totpSecret: '',
    syncFrequency: '15min',
    companyProperty: '1',
  });
  const [scLoaded, setScLoaded] = useState(false);
  const [scSaving, setScSaving] = useState(false);
  const [scSuccess, setScSuccess] = useState('');
  const [scTesting, setScTesting] = useState(false);
  const [scTestResult, setScTestResult] = useState('');
  const [scLastSync, setScLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (scLoaded) return;
    api<{ isEnabled: boolean; serverUrl: string; username: string; password: string; totpSecret: string; syncFrequency: string; companyProperty: string; lastSyncAt: string | null }>('/settings/screenconnect')
      .then(data => {
        setScConfig({
          isEnabled: data.isEnabled,
          serverUrl: data.serverUrl || 'https://rivertowntechnology.screenconnect.com',
          username: data.username || '',
          password: data.password || '',
          totpSecret: data.totpSecret || '',
          syncFrequency: data.syncFrequency || '15min',
          companyProperty: data.companyProperty || '1',
        });
        setScLastSync(data.lastSyncAt);
        setScLoaded(true);
      })
      .catch(() => setScLoaded(true));
  }, [scLoaded]);

  async function saveScreenConnect() {
    setScSaving(true); setScSuccess('');
    try {
      await api('/settings/screenconnect', { method: 'PUT', body: JSON.stringify(scConfig) });
      setScSuccess('ScreenConnect settings saved');
      setTimeout(() => setScSuccess(''), 3000);
    } catch { /* */ }
    finally { setScSaving(false); }
  }

  async function testScreenConnect() {
    setScTesting(true); setScTestResult('');
    try {
      const res = await api<{ success: boolean; message: string }>('/settings/screenconnect/test', { method: 'POST' });
      setScTestResult(res.message);
    } catch (e: unknown) {
      setScTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setScTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          ScreenConnect (ConnectWise Control)
          {scConfig.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Sync remote access sessions and online status from ScreenConnect. Assets will be matched by company name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scSuccess && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{scSuccess}</div>}
        {scTestResult && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{scTestResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable ScreenConnect</div>
            <div className="text-sm text-muted-foreground">Sync sessions and online status from your ScreenConnect instance</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scConfig.isEnabled}
            onClick={() => setScConfig({ ...scConfig, isEnabled: !scConfig.isEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${scConfig.isEnabled ? 'bg-green-500' : 'bg-input'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${scConfig.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Server URL</Label>
          <Input value={scConfig.serverUrl} onChange={e => setScConfig({ ...scConfig, serverUrl: e.target.value })} placeholder="https://yourcompany.screenconnect.com" />
          <p className="text-xs text-muted-foreground">Your ScreenConnect (ConnectWise Control) instance URL</p>
        </div>

        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={scConfig.username} onChange={e => setScConfig({ ...scConfig, username: e.target.value })} placeholder="API user account" />
          <p className="text-xs text-muted-foreground">Create a dedicated API user in ScreenConnect: Admin &rarr; Security &rarr; User Table</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={scConfig.password} onChange={e => setScConfig({ ...scConfig, password: e.target.value })} placeholder="API user password" />
          </div>
          <div className="space-y-2">
            <Label>TOTP Secret</Label>
            <Input type="password" value={scConfig.totpSecret} onChange={e => setScConfig({ ...scConfig, totpSecret: e.target.value })} placeholder="Base32 MFA secret" />
            <p className="text-xs text-muted-foreground">The base32 secret from your MFA setup (not the 6-digit code)</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Company Property</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={scConfig.companyProperty}
            onChange={e => setScConfig({ ...scConfig, companyProperty: e.target.value })}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <option key={n} value={String(n)}>CustomProperty{n}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Which CustomProperty on sessions holds the company name for matching</p>
        </div>

        <div className="space-y-2">
          <Label>Sync Frequency</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={scConfig.syncFrequency}
            onChange={e => setScConfig({ ...scConfig, syncFrequency: e.target.value })}
          >
            <option value="5min">Every 5 minutes</option>
            <option value="15min">Every 15 minutes</option>
            <option value="30min">Every 30 minutes</option>
            <option value="hourly">Every hour</option>
            <option value="4hours">Every 4 hours</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        {scLastSync && (
          <p className="text-xs text-muted-foreground">Last synced: {new Date(scLastSync).toLocaleString()}</p>
        )}

        <div className="flex gap-2">
          <Button onClick={saveScreenConnect} disabled={scSaving}>{scSaving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testScreenConnect} disabled={scTesting || !scConfig.isEnabled}>
            {scTesting ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
