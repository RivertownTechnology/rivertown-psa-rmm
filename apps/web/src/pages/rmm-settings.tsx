import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Shield, Copy, Check, Plus, Pencil, Trash2, Key } from 'lucide-react';

interface RmmPolicy {
  id: string; name: string; description: string | null; isDefault: boolean;
  patchWindows: boolean; patchThirdParty: boolean;
  autoApproveCritical: boolean; autoApproveSecurity: boolean; autoApproveOther: boolean;
  approvalDelayDays: number | null;
  rebootAfterUpdate: boolean; rebootSchedule: string | null;
  maintenanceWindowStart: string | null; maintenanceWindowEnd: string | null;
  maintenanceWindowDays: number[] | null;
  cveScanEnabled: boolean; cveScanFrequencyHours: number | null;
}

interface EdrIntegration {
  id: string; provider: string; apiUrl: string | null;
  apiKeyEncrypted: string | null; isEnabled: boolean;
}

const defaultPolicyForm = {
  name: '', description: '', isDefault: false,
  patchWindows: true, patchThirdParty: false,
  autoApproveCritical: true, autoApproveSecurity: true, autoApproveOther: false,
  approvalDelayDays: '3',
  rebootAfterUpdate: true, rebootSchedule: 'maintenance_window',
  maintenanceWindowStart: '02:00', maintenanceWindowEnd: '06:00',
  maintenanceWindowDays: [1, 2, 3, 4, 5],
  cveScanEnabled: true, cveScanFrequencyHours: '24',
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RmmSettingsPage() {
  const [policies, setPolicies] = useState<RmmPolicy[]>([]);
  const [showPolicyEdit, setShowPolicyEdit] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState({ ...defaultPolicyForm });
  const [saving, setSaving] = useState(false);

  // Enrollment
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [enrollCustomerId, setEnrollCustomerId] = useState('');
  const [enrollSiteId, setEnrollSiteId] = useState('');
  const [enrollToken, setEnrollToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);

  // EDR
  const [edrIntegrations, setEdrIntegrations] = useState<EdrIntegration[]>([]);
  const [edrForms, setEdrForms] = useState<Record<string, { apiUrl: string; apiKey: string; isEnabled: boolean }>>({});

  useEffect(() => {
    api<RmmPolicy[]>('/rmm/policies').then(setPolicies).catch(() => {});
    api<{ data: Array<{ id: string; name: string }> }>('/customers?limit=100').then(d => setCustomers(d.data)).catch(() => {});
    api<EdrIntegration[]>('/rmm/edr-integrations').then(integrations => {
      setEdrIntegrations(integrations);
      const forms: Record<string, any> = {};
      for (const provider of ['bitdefender', 'sentinelone', 'webroot']) {
        const existing = integrations.find(i => i.provider === provider);
        forms[provider] = { apiUrl: existing?.apiUrl ?? '', apiKey: existing?.apiKeyEncrypted ? '••••••••' : '', isEnabled: existing?.isEnabled ?? false };
      }
      setEdrForms(forms);
    }).catch(() => {});
  }, []);

  // Load sites when customer changes
  useEffect(() => {
    if (enrollCustomerId) {
      api<{ data: Array<{ id: string; name: string }> }>(`/sites?customerId=${enrollCustomerId}&limit=100`).then(d => setSites(d.data)).catch(() => {});
    } else { setSites([]); }
  }, [enrollCustomerId]);

  async function seedPolicies() {
    await api('/rmm/policies/seed-defaults', { method: 'POST' });
    const data = await api<RmmPolicy[]>('/rmm/policies');
    setPolicies(data);
  }

  function openPolicyEdit(policy?: RmmPolicy) {
    if (policy) {
      setEditingPolicyId(policy.id);
      setPolicyForm({
        name: policy.name, description: policy.description ?? '', isDefault: policy.isDefault,
        patchWindows: policy.patchWindows, patchThirdParty: policy.patchThirdParty,
        autoApproveCritical: policy.autoApproveCritical, autoApproveSecurity: policy.autoApproveSecurity, autoApproveOther: policy.autoApproveOther,
        approvalDelayDays: String(policy.approvalDelayDays ?? 3),
        rebootAfterUpdate: policy.rebootAfterUpdate, rebootSchedule: policy.rebootSchedule ?? 'maintenance_window',
        maintenanceWindowStart: policy.maintenanceWindowStart ?? '02:00', maintenanceWindowEnd: policy.maintenanceWindowEnd ?? '06:00',
        maintenanceWindowDays: policy.maintenanceWindowDays ?? [1, 2, 3, 4, 5],
        cveScanEnabled: policy.cveScanEnabled, cveScanFrequencyHours: String(policy.cveScanFrequencyHours ?? 24),
      });
    } else {
      setEditingPolicyId(null);
      setPolicyForm({ ...defaultPolicyForm });
    }
    setShowPolicyEdit(true);
  }

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...policyForm,
        approvalDelayDays: parseInt(policyForm.approvalDelayDays),
        cveScanFrequencyHours: parseInt(policyForm.cveScanFrequencyHours),
      };
      if (editingPolicyId) {
        await api(`/rmm/policies/${editingPolicyId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/rmm/policies', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowPolicyEdit(false);
      const data = await api<RmmPolicy[]>('/rmm/policies');
      setPolicies(data);
    } finally { setSaving(false); }
  }

  async function deletePolicy(id: string) {
    await api(`/rmm/policies/${id}`, { method: 'DELETE' });
    setPolicies(p => p.filter(x => x.id !== id));
  }

  async function generateToken() {
    if (!enrollCustomerId) return;
    const data = await api<{ token: string }>('/rmm/enrollment-token', {
      method: 'POST', body: JSON.stringify({ customerId: enrollCustomerId, siteId: enrollSiteId || undefined }),
    });
    setEnrollToken(data.token);
  }

  function copyToken() {
    navigator.clipboard.writeText(enrollToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  async function saveEdr(provider: string) {
    const form = edrForms[provider]; if (!form) return;
    const existing = edrIntegrations.find(i => i.provider === provider);
    const payload: any = { provider, apiUrl: form.apiUrl, isEnabled: form.isEnabled };
    if (form.apiKey && form.apiKey !== '••••••••') payload.apiKeyEncrypted = form.apiKey;
    if (existing) {
      await api(`/rmm/edr-integrations/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/rmm/edr-integrations', { method: 'POST', body: JSON.stringify(payload) });
    }
    const updated = await api<EdrIntegration[]>('/rmm/edr-integrations');
    setEdrIntegrations(updated);
  }

  function toggleDay(day: number) {
    setPolicyForm(f => ({
      ...f,
      maintenanceWindowDays: f.maintenanceWindowDays.includes(day)
        ? f.maintenanceWindowDays.filter(d => d !== day)
        : [...f.maintenanceWindowDays, day].sort(),
    }));
  }

  return (
    <div className="space-y-6">
      {/* RMM Policies */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>RMM Policies</CardTitle>
              <CardDescription>Patch management, reboot schedules, and CVE scanning rules</CardDescription>
            </div>
            <div className="flex gap-2">
              {policies.length === 0 && <Button variant="outline" size="sm" onClick={seedPolicies}>Seed Defaults</Button>}
              <Button size="sm" onClick={() => openPolicyEdit()}><Plus className="h-3 w-3 mr-1" />Add Policy</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Policy</th>
              <th className="text-left p-3 font-medium">Patching</th>
              <th className="text-left p-3 font-medium">Reboot</th>
              <th className="text-left p-3 font-medium">Maintenance</th>
              <th className="text-left p-3 font-medium">CVE Scan</th>
              <th className="w-20"></th>
            </tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{p.name} {p.isDefault && <Badge variant="outline" className="ml-1 text-xs">Default</Badge>}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                  </td>
                  <td className="p-3 text-xs">
                    <div>{p.autoApproveCritical && <Badge variant="destructive" className="text-[10px] mr-1">Crit</Badge>}{p.autoApproveSecurity && <Badge variant="default" className="text-[10px] mr-1">Sec</Badge>}{p.autoApproveOther && <Badge variant="secondary" className="text-[10px]">Other</Badge>}</div>
                    {p.approvalDelayDays ? <div className="text-muted-foreground mt-1">{p.approvalDelayDays}d delay</div> : null}
                  </td>
                  <td className="p-3 text-xs capitalize">{p.rebootSchedule?.replace(/_/g, ' ') ?? '-'}</td>
                  <td className="p-3 text-xs">{p.maintenanceWindowStart && p.maintenanceWindowEnd ? `${p.maintenanceWindowStart}-${p.maintenanceWindowEnd}` : 'None'}</td>
                  <td className="p-3 text-xs">{p.cveScanEnabled ? `Every ${p.cveScanFrequencyHours}h` : 'Off'}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPolicyEdit(p)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deletePolicy(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No policies. Click "Seed Defaults" to create Standard and Aggressive.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Agent Enrollment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />Agent Enrollment</CardTitle>
          <CardDescription>Generate enrollment tokens for deploying the RMM agent to customer devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Customer</Label>
              <select value={enrollCustomerId} onChange={e => { setEnrollCustomerId(e.target.value); setEnrollSiteId(''); setEnrollToken(''); }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Site (optional)</Label>
              <select value={enrollSiteId} onChange={e => setEnrollSiteId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">All sites</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={generateToken} disabled={!enrollCustomerId} className="w-full">Generate Token</Button>
            </div>
          </div>
          {enrollToken && (
            <div className="space-y-2">
              <Label>Enrollment Token (valid for 24 hours)</Label>
              <div className="flex gap-2">
                <Input value={enrollToken} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyToken}>
                  {tokenCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="bg-muted p-3 rounded-md text-xs font-mono">
                <div className="text-muted-foreground mb-1"># Install command (run on target device as admin):</div>
                <div>RivertownAgent.exe --enroll --token "{enrollToken.substring(0, 20)}..." --api "http://localhost:3000"</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EDR/AV Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />EDR/AV Integrations</CardTitle>
          <CardDescription>Connect your endpoint detection and antivirus platforms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {['bitdefender', 'sentinelone', 'webroot'].map(provider => {
            const form = edrForms[provider] ?? { apiUrl: '', apiKey: '', isEnabled: false };
            const labels: Record<string, string> = { bitdefender: 'Bitdefender GravityZone', sentinelone: 'SentinelOne', webroot: 'Webroot' };
            return (
              <div key={provider} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{labels[provider]}</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.isEnabled} onChange={e => setEdrForms(f => ({ ...f, [provider]: { ...form, isEnabled: e.target.checked } }))} className="h-4 w-4" />
                    Enabled
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">API URL</Label>
                    <Input value={form.apiUrl} onChange={e => setEdrForms(f => ({ ...f, [provider]: { ...form, apiUrl: e.target.value } }))} placeholder={provider === 'bitdefender' ? 'https://cloud.gravityzone.bitdefender.com/api' : provider === 'sentinelone' ? 'https://usea1.sentinelone.net' : 'https://api.webroot.com'} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">API Key</Label>
                    <Input type="password" value={form.apiKey} onChange={e => setEdrForms(f => ({ ...f, [provider]: { ...form, apiKey: e.target.value } }))} placeholder="Enter API key" />
                  </div>
                </div>
                <Button size="sm" onClick={() => saveEdr(provider)}>Save {labels[provider]}</Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Policy Edit Dialog */}
      <Dialog open={showPolicyEdit} onOpenChange={setShowPolicyEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPolicyId ? 'Edit Policy' : 'Add Policy'}</DialogTitle></DialogHeader>
          <form onSubmit={savePolicy} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Name</Label><Input required value={policyForm.name} onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })} placeholder="Standard" /></div>
              <div className="space-y-2"><Label>Description</Label><Input value={policyForm.description} onChange={e => setPolicyForm({ ...policyForm, description: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={policyForm.isDefault} onChange={e => setPolicyForm({ ...policyForm, isDefault: e.target.checked })} className="h-4 w-4" /><span className="text-sm">Default policy</span></label>

            <Separator />
            <div className="text-sm font-medium">Patch Approval</div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={policyForm.autoApproveCritical} onChange={e => setPolicyForm({ ...policyForm, autoApproveCritical: e.target.checked })} /><span className="text-sm">Critical</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={policyForm.autoApproveSecurity} onChange={e => setPolicyForm({ ...policyForm, autoApproveSecurity: e.target.checked })} /><span className="text-sm">Security</span></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={policyForm.autoApproveOther} onChange={e => setPolicyForm({ ...policyForm, autoApproveOther: e.target.checked })} /><span className="text-sm">Other</span></label>
            </div>
            <div className="space-y-2"><Label>Approval Delay (days)</Label><Input type="number" min="0" value={policyForm.approvalDelayDays} onChange={e => setPolicyForm({ ...policyForm, approvalDelayDays: e.target.value })} className="w-24" /></div>

            <Separator />
            <div className="text-sm font-medium">Reboot</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={policyForm.rebootAfterUpdate} onChange={e => setPolicyForm({ ...policyForm, rebootAfterUpdate: e.target.checked })} className="h-4 w-4" /><span className="text-sm">Reboot after updates</span></label>
            <div className="space-y-2"><Label>Reboot Schedule</Label>
              <select value={policyForm.rebootSchedule} onChange={e => setPolicyForm({ ...policyForm, rebootSchedule: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="maintenance_window">During maintenance window</option>
                <option value="immediate">Immediately</option>
                <option value="never">Never (user-initiated only)</option>
              </select>
            </div>

            <Separator />
            <div className="text-sm font-medium">Maintenance Window</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start</Label><Input type="time" value={policyForm.maintenanceWindowStart} onChange={e => setPolicyForm({ ...policyForm, maintenanceWindowStart: e.target.value })} /></div>
              <div className="space-y-2"><Label>End</Label><Input type="time" value={policyForm.maintenanceWindowEnd} onChange={e => setPolicyForm({ ...policyForm, maintenanceWindowEnd: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex gap-1">
                {dayLabels.map((label, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    className={`px-2 py-1 text-xs rounded border ${policyForm.maintenanceWindowDays.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input text-muted-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />
            <div className="text-sm font-medium">CVE Scanning</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={policyForm.cveScanEnabled} onChange={e => setPolicyForm({ ...policyForm, cveScanEnabled: e.target.checked })} className="h-4 w-4" /><span className="text-sm">Enable CVE scanning</span></label>
            <div className="space-y-2"><Label>Scan Frequency (hours)</Label><Input type="number" min="1" value={policyForm.cveScanFrequencyHours} onChange={e => setPolicyForm({ ...policyForm, cveScanFrequencyHours: e.target.value })} className="w-24" /></div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPolicyEdit(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingPolicyId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
