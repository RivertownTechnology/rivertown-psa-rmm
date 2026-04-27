import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { HardDrive, CheckCircle } from 'lucide-react';

export function StorageCard() {
  const [config, setConfig] = useState({
    isEnabled: false,
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: 'rivertown-psa',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    if (loaded) return;
    api<{ isEnabled: boolean; accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string }>('/settings/storage')
      .then(data => {
        setConfig({
          isEnabled: data.isEnabled,
          accountId: data.accountId || '',
          accessKeyId: data.accessKeyId || '',
          secretAccessKey: data.secretAccessKey || '',
          bucketName: data.bucketName || 'rivertown-psa',
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  async function saveStorage() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/storage', { method: 'PUT', body: JSON.stringify(config) });
      setSuccess('Storage settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  async function testStorage() {
    setTesting(true); setTestResult('');
    try {
      const res = await api<{ success: boolean; error?: string }>('/settings/storage/test', { method: 'POST' });
      setTestResult(res.success ? 'Connection successful! Bucket is accessible.' : (res.error || 'Test failed'));
    } catch (e: unknown) {
      setTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Cloudflare R2 Storage
          {config.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Configure Cloudflare R2 for file attachments, document storage, and backups.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}
        {testResult && <div className={`text-sm p-3 rounded-md border mb-4 ${testResult.includes('successful') ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'}`}>{testResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable R2 Storage</div>
            <div className="text-sm text-muted-foreground">Store file attachments in Cloudflare R2</div>
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
          <Label>Account ID</Label>
          <Input value={config.accountId} onChange={e => setConfig({ ...config, accountId: e.target.value })} placeholder="Your Cloudflare account ID" />
          <p className="text-xs text-muted-foreground">Found in Cloudflare dashboard URL: dash.cloudflare.com/&lt;account-id&gt;</p>
        </div>

        <div className="space-y-2">
          <Label>Access Key ID</Label>
          <Input value={config.accessKeyId} onChange={e => setConfig({ ...config, accessKeyId: e.target.value })} placeholder="R2 API token access key" />
        </div>

        <div className="space-y-2">
          <Label>Secret Access Key</Label>
          <Input type="password" value={config.secretAccessKey} onChange={e => setConfig({ ...config, secretAccessKey: e.target.value })} placeholder="R2 API token secret" />
          <p className="text-xs text-muted-foreground">Create an R2 API token in Cloudflare: R2 &gt; Manage R2 API Tokens</p>
        </div>

        <div className="space-y-2">
          <Label>Bucket Name</Label>
          <Input value={config.bucketName} onChange={e => setConfig({ ...config, bucketName: e.target.value })} placeholder="rivertown-psa" />
          <p className="text-xs text-muted-foreground">The R2 bucket name for storing files</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={saveStorage} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testStorage} disabled={testing || !config.isEnabled}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
