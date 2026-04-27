import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DollarSign } from 'lucide-react';

export function QuickBooksCard() {
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<{ connected: boolean; companyName: string | null; isEnabled: boolean; lastSyncAt: string | null; syncStatus: string | null; syncError: string | null; syncFrequency: string }>({
    connected: false, companyName: null, isEnabled: false, lastSyncAt: null, syncStatus: null, syncError: null, syncFrequency: 'daily',
  });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof status>('/settings/quickbooks').then(setStatus).catch(() => {});

    // Handle OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const realmId = params.get('realmId');
    const state = params.get('state');
    if (code && realmId) {
      api<{ success: boolean; companyName: string }>('/integrations/quickbooks/callback', {
        method: 'POST', body: JSON.stringify({ code, realmId, state: state || '' }),
      }).then(res => {
        setMessage(`Connected to ${res.companyName}`);
        api<typeof status>('/settings/quickbooks').then(setStatus);
        window.history.replaceState({}, '', window.location.pathname);
      }).catch(err => setMessage(err instanceof Error ? err.message : 'Connection failed'));
    }
  }, []);

  async function connect() {
    const res = await api<{ authUrl: string }>('/integrations/quickbooks/authorize');
    window.location.href = res.authUrl;
  }

  async function disconnect() {
    const ok = await confirm({ title: 'Disconnect QuickBooks?', description: 'Disconnect QuickBooks Online? You will need to reconnect to sync data again.', confirmLabel: 'Disconnect' });
    if (!ok) return;
    await api('/integrations/quickbooks/disconnect', { method: 'POST' });
    setStatus(s => ({ ...s, connected: false, companyName: null, isEnabled: false }));
    setMessage('Disconnected');
  }

  async function syncNow() {
    setSyncing(true); setMessage('');
    try {
      const res = await api<{ customers: number; invoices: number; payments: number }>('/settings/quickbooks/sync', { method: 'POST' });
      setMessage(`Synced ${res.customers} customers, ${res.invoices} invoices, ${res.payments} payments`);
      api<typeof status>('/settings/quickbooks').then(setStatus);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncing(false); }
  }

  async function updateFrequency(freq: string) {
    await api('/settings/quickbooks', { method: 'PUT', body: JSON.stringify({ syncFrequency: freq }) });
    setStatus(s => ({ ...s, syncFrequency: freq }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />QuickBooks Online</CardTitle>
        <CardDescription>Sync invoices, payments, and customers with QuickBooks Online for bookkeeping.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}

        {!status.connected ? (
          <Button onClick={connect}>Connect QuickBooks</Button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-green-100 text-green-800">Connected</Badge>
              {status.companyName && <span className="text-sm font-medium">{status.companyName}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Last Sync:</span>{' '}
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className={status.syncStatus === 'error' ? 'text-red-600' : ''}>{status.syncStatus || 'idle'}</span>
              </div>
            </div>

            {status.syncError && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{status.syncError}</div>
            )}

            <div className="flex items-center gap-3">
              <Label>Sync Frequency:</Label>
              <select
                value={status.syncFrequency}
                onChange={e => updateFrequency(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="15min">Every 15 min</option>
                <option value="30min">Every 30 min</option>
                <option value="hourly">Hourly</option>
                <option value="4hours">Every 4 hours</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</Button>
              <Button size="sm" variant="destructive" onClick={disconnect}>Disconnect</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
