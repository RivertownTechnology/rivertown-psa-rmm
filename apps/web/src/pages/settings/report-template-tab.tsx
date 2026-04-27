import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ReportTemplateTab() {
  const [config, setConfig] = useState({
    reportPrimaryColor: '#2563eb',
    reportAccentColor: '#3b82f6',
    reportLogoUrl: '',
    reportCompanyName: '',
    reportFooterText: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (loaded) return;
    api<typeof config>('/settings/report-template').then(d => {
      setConfig({
        reportPrimaryColor: d.reportPrimaryColor || '#2563eb',
        reportAccentColor: d.reportAccentColor || '#3b82f6',
        reportLogoUrl: d.reportLogoUrl || '',
        reportCompanyName: d.reportCompanyName || '',
        reportFooterText: d.reportFooterText || '',
      });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [loaded]);

  async function save() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/report-template', { method: 'PUT', body: JSON.stringify(config) });
      setSuccess('Saved'); setTimeout(() => setSuccess(''), 3000);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Report Template</CardTitle>
          <CardDescription>Customize the appearance of executive summary reports sent to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={config.reportPrimaryColor} onChange={e => setConfig({...config, reportPrimaryColor: e.target.value})} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={config.reportPrimaryColor} onChange={e => setConfig({...config, reportPrimaryColor: e.target.value})} className="flex-1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={config.reportAccentColor} onChange={e => setConfig({...config, reportAccentColor: e.target.value})} className="h-9 w-14 rounded border cursor-pointer" />
                <Input value={config.reportAccentColor} onChange={e => setConfig({...config, reportAccentColor: e.target.value})} className="flex-1" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Company Logo URL</Label>
            <Input value={config.reportLogoUrl} onChange={e => setConfig({...config, reportLogoUrl: e.target.value})} placeholder="https://yourdomain.com/logo.png" />
            <p className="text-xs text-muted-foreground">URL to your company logo displayed in report headers</p>
          </div>
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={config.reportCompanyName} onChange={e => setConfig({...config, reportCompanyName: e.target.value})} placeholder="Rivertown Technology" />
          </div>
          <div className="space-y-2">
            <Label>Footer Text</Label>
            <textarea rows={2} value={config.reportFooterText} onChange={e => setConfig({...config, reportFooterText: e.target.value})}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="Thank you for choosing Rivertown Technology for your IT needs." />
          </div>

          {/* Live preview */}
          <div>
            <Label className="mb-2 block">Preview</Label>
            <div className="border rounded-lg overflow-hidden">
              <div style={{ background: config.reportPrimaryColor }} className="p-4 flex items-center gap-3">
                {config.reportLogoUrl && <img src={config.reportLogoUrl} alt="" className="h-8 rounded" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display = 'none')} />}
                <span className="text-white font-semibold">{config.reportCompanyName || 'Your Company'}</span>
                <span className="text-white/70 text-sm ml-auto">Executive Summary Report</span>
              </div>
              <div className="p-4 text-sm text-muted-foreground">
                <div className="flex gap-4">
                  <div className="flex-1 rounded-lg p-3" style={{ background: config.reportAccentColor + '15' }}>
                    <div className="text-2xl font-bold" style={{ color: config.reportPrimaryColor }}>12</div>
                    <div className="text-xs">Total Tickets</div>
                  </div>
                  <div className="flex-1 rounded-lg p-3" style={{ background: config.reportAccentColor + '15' }}>
                    <div className="text-2xl font-bold text-green-600">95%</div>
                    <div className="text-xs">SLA Compliance</div>
                  </div>
                  <div className="flex-1 rounded-lg p-3" style={{ background: config.reportAccentColor + '15' }}>
                    <div className="text-2xl font-bold" style={{ color: config.reportPrimaryColor }}>$4,200</div>
                    <div className="text-xs">Monthly Revenue</div>
                  </div>
                </div>
              </div>
              {config.reportFooterText && (
                <div className="border-t px-4 py-2 text-xs text-muted-foreground text-center">{config.reportFooterText}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</Button>
            {success && <span className="text-sm text-green-600">{success}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
