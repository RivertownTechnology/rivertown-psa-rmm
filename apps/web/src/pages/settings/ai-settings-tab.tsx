import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Sparkles } from 'lucide-react';

export function AISettingsTab() {
  const [config, setConfig] = useState({ isEnabled: false, provider: 'anthropic' as 'anthropic' | 'openai', apiKey: '', model: 'claude-sonnet-4-20250514', personality: '', name: 'Atlas' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  const anthropicModels = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Faster, cheaper)' },
    { value: 'claude-opus-4-20250115', label: 'Claude Opus 4 (Most capable)' },
  ];
  const openaiModels = [
    { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, cheaper)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (High capability)' },
    { value: 'o3-mini', label: 'o3-mini (Reasoning)' },
  ];
  const models = config.provider === 'anthropic' ? anthropicModels : openaiModels;

  useEffect(() => {
    api<typeof config>('/settings/ai').then(data => setConfig({
      isEnabled: data.isEnabled ?? false,
      provider: (data.provider as 'anthropic' | 'openai') || 'anthropic',
      apiKey: data.apiKey || '',
      model: data.model || 'claude-sonnet-4-20250514',
      personality: data.personality || '',
      name: data.name || 'Atlas',
    })).catch(() => {});
  }, []);

  function changeProvider(provider: 'anthropic' | 'openai') {
    const defaultModel = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
    setConfig(c => ({ ...c, provider, model: defaultModel }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/ai', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('AI settings saved');
      const updated = await api<typeof config>('/settings/ai');
      setConfig({
        isEnabled: updated.isEnabled ?? false,
        provider: (updated.provider as 'anthropic' | 'openai') || 'anthropic',
        apiKey: updated.apiKey || '',
        model: updated.model || 'claude-sonnet-4-20250514',
        personality: updated.personality || '',
        name: updated.name || 'Atlas',
      });
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/ai/test', { method: 'POST', body: JSON.stringify({}) });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI Assistant</CardTitle>
          <CardDescription>Configure AI-powered features for ticket management. Choose your preferred provider for ticket summaries and reply improvement.</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Enable AI features</label>
              <button type="button" role="switch" aria-checked={config.isEnabled}
                onClick={() => setConfig(c => ({...c, isEnabled: !c.isEnabled}))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div>
              <Label>Provider</Label>
              <select value={config.provider} onChange={e => changeProvider(e.target.value as 'anthropic' | 'openai')}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (ChatGPT)</option>
              </select>
            </div>

            <div>
              <Label>Model</Label>
              <select value={config.model} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Assistant Name</Label>
              <Input value={config.name} onChange={e => setConfig(c => ({ ...c, name: e.target.value }))} placeholder="Atlas" />
              <p className="text-xs text-muted-foreground mt-1">The name your AI assistant uses when chatting</p>
            </div>

            <div>
              <Label>AI Personality & Tone</Label>
              <textarea value={config.personality} onChange={e => setConfig(c => ({ ...c, personality: e.target.value }))}
                placeholder="Professional and friendly. Address the customer by first name. Keep responses concise but helpful."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
              <p className="text-xs text-muted-foreground mt-1">Instructions that guide how the AI writes replies and summaries for your MSP</p>
            </div>

            <div>
              <Label>{config.provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}</Label>
              <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder={config.provider === 'anthropic' ? 'sk-ant-api03-...' : 'sk-...'} />
              <p className="text-xs text-muted-foreground mt-1">
                {config.provider === 'anthropic'
                  ? <>Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.anthropic.com</a></>
                  : <>Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></>
                }
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-medium">Features</div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> <strong>Ticket Summarize</strong> — AI reads the full ticket and generates a concise summary</div>
                <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> <strong>Improve Reply</strong> — AI rewrites your draft reply to be customer-friendly and professional</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
