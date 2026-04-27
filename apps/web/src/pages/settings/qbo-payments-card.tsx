import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign } from 'lucide-react';

export function QBOPaymentsCard() {
  const [status, setStatus] = useState({ isEnabled: false, qboConnected: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof status>('/settings/qbo-payments').then(setStatus).catch(() => {});
  }, []);

  async function toggleEnabled(enabled: boolean) {
    setSaving(true); setMessage('');
    try {
      await api('/settings/qbo-payments', { method: 'PUT', body: JSON.stringify({ isEnabled: enabled }) });
      setStatus(s => ({ ...s, isEnabled: enabled }));
      setMessage(enabled ? 'QBO Payments enabled' : 'QBO Payments disabled');
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />QuickBooks Payments</CardTitle>
        <CardDescription>Accept payments via QuickBooks Payments. Uses your existing QuickBooks Online connection.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        {!status.qboConnected ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm p-3 rounded-md border border-amber-200 dark:border-amber-800 space-y-3">
            <p>QuickBooks Online must be connected before you can enable QuickBooks Payments.</p>
            <Button size="sm" onClick={() => {
              window.location.hash = 'integrations/accounting/quickbooks';
              window.location.reload();
            }}>Go to Accounting → QuickBooks</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={status.isEnabled}
                onClick={() => toggleEnabled(!status.isEnabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${status.isEnabled ? 'bg-green-500' : 'bg-input'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${status.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm font-medium">Enable QuickBooks Payments</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ensure QuickBooks Payments is active in your QuickBooks Online account. Once enabled, invoices synced to QBO will include a "Pay Online" link powered by QB Payments.
            </p>
            <p className="text-xs text-muted-foreground">Optional — built-in CSAT is already active on resolved tickets. CrewHU is for advanced survey features only.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
