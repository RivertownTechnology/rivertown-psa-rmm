import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Server, CheckCircle } from 'lucide-react';

export function NCentralCard() {
  const [config, setConfig] = useState({
    isEnabled: false,
    serverUrl: '',
    jwtToken: '',
    psaApiUsername: '',
    psaApiPassword: '',
    syncFrequency: '15min',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    api<{ isEnabled: boolean; serverUrl: string; jwtToken: string; syncFrequency: string; lastSyncAt: string | null }>('/settings/ncentral')
      .then(data => {
        setConfig({
          isEnabled: data.isEnabled,
          serverUrl: data.serverUrl || '',
          jwtToken: '',
          psaApiUsername: (data as any).psaApiUsername || (data as any).psaUsername || '',
          psaApiPassword: '',
          syncFrequency: data.syncFrequency || '15min',
        });
        setLastSync(data.lastSyncAt);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  async function saveNCentral() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/ncentral', { method: 'PUT', body: JSON.stringify(config) });
      setSuccess('N-central settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  async function testNCentral() {
    setTesting(true); setTestResult('');
    try {
      const res = await api<{ success: boolean; message: string }>('/settings/ncentral/test', { method: 'POST' });
      setTestResult(res.message);
    } catch (e: unknown) {
      setTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          N-central
          {config.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Sync devices and monitoring status from N-central. Assets will be matched by device name and customer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}
        {testResult && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4 whitespace-pre-line">{testResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable N-central</div>
            <div className="text-sm text-muted-foreground">Sync devices and monitoring data from your N-central instance</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.isEnabled}
            onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Server URL</Label>
          <Input value={config.serverUrl} onChange={e => setConfig({ ...config, serverUrl: e.target.value })} placeholder="https://your-ncentral-server.com" />
          <p className="text-xs text-muted-foreground">Your N-central server FQDN</p>
        </div>

        <div className="space-y-2">
          <Label>JWT Token (for device sync)</Label>
          <Input type="password" value={config.jwtToken} onChange={e => setConfig({ ...config, jwtToken: e.target.value })} placeholder={loaded && config.isEnabled ? 'Token saved — leave blank to keep' : 'JWT token from N-central'} />
          <p className="text-xs text-muted-foreground">Generate in N-central: Administration &rarr; User Management &rarr; Users &rarr; [User] &rarr; API Access &rarr; Generate JSON Web Token</p>
        </div>

        <Separator />

        <div className="text-sm font-medium">N-central PSA API Credentials</div>
        <p className="text-xs text-muted-foreground">From N-central: Administration &rarr; PSA Integration &rarr; PSA Configuration. These credentials let your PSA communicate with N-central's API.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>API Username</Label>
            <Input value={config.psaApiUsername} onChange={e => setConfig({ ...config, psaApiUsername: e.target.value })} placeholder="custompsa/1473" />
          </div>
          <div className="space-y-2">
            <Label>API Password</Label>
            <Input type="password" value={config.psaApiPassword} onChange={e => setConfig({ ...config, psaApiPassword: e.target.value })} placeholder={loaded && config.isEnabled ? 'Saved — leave blank to keep' : 'Password from N-central'} />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Sync Frequency</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={config.syncFrequency}
            onChange={e => setConfig({ ...config, syncFrequency: e.target.value })}
          >
            <option value="15min">Every 15 minutes</option>
            <option value="30min">Every 30 minutes</option>
            <option value="hourly">Every hour</option>
            <option value="4hours">Every 4 hours</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-sm font-medium">N-central PSA Ticketing Integration</div>
          <p className="text-xs text-muted-foreground">Configure these values in N-central under Administration &rarr; PSA Integration &rarr; PSA Configuration &rarr; Custom PSA:</p>
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs font-mono">
            <div><span className="text-muted-foreground">Base Endpoint URL:</span> <span className="select-all font-semibold">{window.location.origin.replace('psa.', 'api.').replace(':5173', ':3000')}</span></div>
            <div><span className="text-muted-foreground">Ticketing Endpoint:</span> <span className="select-all font-semibold">/api/ncentral/ticketRequests</span></div>
            <div><span className="text-muted-foreground">User Name:</span> <span className="select-all font-semibold">ncentral</span></div>
            <div><span className="text-muted-foreground">Password:</span> <span className="text-muted-foreground italic">Use the same JWT token above, or set PUBLIC_API_KEY env var</span></div>
          </div>
          <p className="text-xs text-muted-foreground">When N-central generates a ticket, it will be created in your PSA with source "agent_alert". Alerts map to priorities: Critical/Failed &rarr; Critical, Warning &rarr; High, Normal &rarr; Medium, Information &rarr; Low.</p>
        </div>

        {lastSync && (
          <p className="text-xs text-muted-foreground">Last synced: {new Date(lastSync).toLocaleString()}</p>
        )}

        <p className="text-xs text-muted-foreground">Credentials stored encrypted. Device sync is available — configure and enable to start syncing assets.</p>

        <div className="flex gap-2">
          <Button onClick={saveNCentral} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testNCentral} disabled={testing || !config.isEnabled}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button variant="outline" onClick={async () => {
            setTesting(true); setTestResult('');
            try {
              const res = await api<any>('/settings/ncentral/sync', { method: 'POST' });
              if (res.success) {
                let msg = `Sync complete: ${res.devices ?? 0} devices found, ${res.synced ?? 0} synced, ${res.created ?? 0} created`;
                if (res.ncCustomerNames?.length) {
                  msg += `\nN-central customers: ${res.ncCustomerNames.join(', ')}`;
                }
                if (res.unmatchedCustomers?.length) {
                  msg += `\n❌ Unmatched: ${res.unmatchedCustomers.join(', ')}`;
                  msg += `\nGo to each customer → Edit → set "N-central Name" to the exact name above.`;
                }
                setTestResult(msg);
              } else {
                setTestResult(`Sync failed: ${res.error}`);
              }
            } catch (e: any) { setTestResult(e.message || 'Sync failed'); }
            finally { setTesting(false); }
          }} disabled={testing || !config.isEnabled}>
            {testing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
