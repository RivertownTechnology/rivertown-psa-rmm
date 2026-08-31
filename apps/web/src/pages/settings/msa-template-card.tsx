import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Eye, RotateCcw } from 'lucide-react';

const SAMPLE_VARS: Record<string, string> = {
  customerName: 'Acme Manufacturing, LLC',
  businessName: 'Rivertown Technology',
  businessAddress: '123 Main St, Conway, SC 29526',
  businessEmail: 'sales@rivertowntechnology.com',
  effectiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  quoteNumber: '#42',
};

function renderPreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => SAMPLE_VARS[key] ?? '');
}

export function MsaTemplateCard() {
  const [template, setTemplate] = useState('');
  const [mergeFields, setMergeFields] = useState<string[]>([]);
  const [isCustomized, setIsCustomized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const data = await api<{ msaTemplateHtml: string; isCustomized: boolean; mergeFields: string[] }>('/settings/msa-template');
      setTemplate(data.msaTemplateHtml);
      setIsCustomized(data.isCustomized);
      setMergeFields(data.mergeFields);
    } catch { /* */ }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setSaving(true); setMessage('');
    try {
      await api('/settings/msa-template', { method: 'PUT', body: JSON.stringify({ msaTemplateHtml: template }) });
      setMessage('MSA template saved');
      await load();
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    setSaving(true); setMessage('');
    try {
      await api('/settings/msa-template', { method: 'PUT', body: JSON.stringify({ msaTemplateHtml: '' }) });
      setMessage('Reset to default template');
      await load();
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Reset failed'); }
    finally { setSaving(false); }
  }

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #201e1d; background: #f3f2f2; padding: 32px; line-height: 1.6; font-size: 14px; }
    h2 { font-size: 22px; } h3 { font-size: 16px; }
  </style></head><body>${renderPreview(template)}</body></html>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5" />MSA Template
          {isCustomized && <Badge variant="secondary" className="text-xs">Customized</Badge>}
        </CardTitle>
        <CardDescription>
          The Master Service Agreement sent automatically (from the sales email) when a customer approves a quote.
          Edit the HTML below — merge fields are replaced with real values at send time, and the customer signs it electronically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800">{message}</div>}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Merge fields:</span>
          {mergeFields.map(f => (
            <code key={f} className="text-xs bg-muted px-2 py-0.5 rounded">{`{{${f}}}`}</code>
          ))}
        </div>

        <textarea
          rows={16}
          value={template}
          onChange={e => setTemplate(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          spellCheck={false}
        />

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</Button>
          <Button variant="outline" onClick={() => setShowPreview(p => !p)}>
            <Eye className="h-4 w-4 mr-1" />{showPreview ? 'Hide Preview' : 'Preview'}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-1" />Reset to Default
          </Button>
        </div>

        {showPreview && (
          <iframe
            title="MSA preview"
            srcDoc={previewDoc}
            sandbox=""
            className="w-full h-[480px] rounded-md border border-input bg-white"
          />
        )}
      </CardContent>
    </Card>
  );
}
