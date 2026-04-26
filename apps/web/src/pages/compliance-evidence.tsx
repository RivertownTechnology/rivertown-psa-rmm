import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Plus, Trash2, AlertTriangle, Camera, Settings, ScrollText, Link2, ShieldCheck } from 'lucide-react';

interface EvidenceRecord {
  id: string; customerId: string; title: string; evidenceType: string;
  description: string | null; fileName: string | null; fileSize: number | null;
  collectedAt: string | null; expiresAt: string | null; reviewedAt: string | null;
  tags: string[] | null;
}

const TYPE_CONFIG: Record<string, { color: string; icon: typeof FileText }> = {
  document: { color: 'bg-blue-100 text-blue-700', icon: FileText },
  screenshot: { color: 'bg-purple-100 text-purple-700', icon: Camera },
  config_export: { color: 'bg-cyan-100 text-cyan-700', icon: Settings },
  log: { color: 'bg-gray-100 text-gray-700', icon: ScrollText },
  attestation: { color: 'bg-green-100 text-green-700', icon: ShieldCheck },
  link: { color: 'bg-indigo-100 text-indigo-700', icon: Link2 },
};

const emptyForm = {
  title: '', evidenceType: 'document', description: '', externalUrl: '',
  collectedAt: '', expiresAt: '',
};

export function ComplianceEvidencePage() {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');

  const load = useCallback(async () => {
    if (!selectedCustomer) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    const data = await api<EvidenceRecord[]>(`/compliance/customers/${selectedCustomer}/evidence`);
    setRecords(data);
    setLoading(false);
  }, [selectedCustomer]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any[]>('/compliance/scoped-customers').then(d => setCustomers(d ?? [])).catch(() => {});
  }, []);

  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 86400000);
  const expired = records.filter(r => r.expiresAt && new Date(r.expiresAt) < today).length;
  const expiringSoon = records.filter(r => r.expiresAt && new Date(r.expiresAt) >= today && new Date(r.expiresAt) <= soon).length;
  const warningCount = expired + expiringSoon;

  async function handleSave() {
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      await api(`/compliance/customers/${selectedCustomer}/evidence`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowForm(false); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  function truncate(s: string | null, max = 60) {
    if (!s) return '—';
    return s.length > max ? s.slice(0, max) + '...' : s;
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  return (
    <div className="space-y-4">
      {warningCount > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-300">
              {expired > 0 && <>{expired} expired evidence record{expired > 1 ? 's' : ''}</>}
              {expired > 0 && expiringSoon > 0 && ' and '}
              {expiringSoon > 0 && <>{expiringSoon} expiring within 30 days</>}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 justify-between">
        <Combobox
          options={[{ value: '', label: 'Select Customer...' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
          value={selectedCustomer}
          onValueChange={v => setSelectedCustomer(v)}
          placeholder="Select Customer..."
          className="w-56"
        />
        <Button size="sm" disabled={!selectedCustomer} onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Evidence
        </Button>
      </div>

      {!selectedCustomer ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">Select a customer to view evidence records.</p></CardContent></Card>
      ) : loading ? <Skeleton className="h-64" /> : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No evidence records for this customer.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Collected</th>
                <th className="text-left px-4 py-2 font-medium">Expires</th>
                <th className="text-left px-4 py-2 font-medium">Tags</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {records.map(r => {
                  const isExpired = r.expiresAt && new Date(r.expiresAt) < today;
                  const isExpiring = r.expiresAt && !isExpired && new Date(r.expiresAt) <= soon;
                  const cfg = TYPE_CONFIG[r.evidenceType] || TYPE_CONFIG.document;
                  const TypeIcon = cfg.icon;
                  return (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 ${isExpired ? 'bg-red-50/50' : isExpiring ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-2 font-medium">{r.title}</td>
                      <td className="px-4 py-2">
                        <Badge className={`${cfg.color} border-0 text-[10px] gap-1`}>
                          <TypeIcon className="h-3 w-3" />
                          {r.evidenceType.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{truncate(r.description)}</td>
                      <td className="px-4 py-2 text-xs">{formatDate(r.collectedAt)}</td>
                      <td className="px-4 py-2 text-xs">
                        {r.expiresAt ? (
                          <span className={isExpired ? 'text-red-700 font-medium' : isExpiring ? 'text-yellow-700 font-medium' : ''}>
                            {formatDate(r.expiresAt)}
                            {isExpired && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-500" />}
                            {isExpiring && <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-500" />}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {r.tags && r.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { if (!confirm('Delete this evidence record?')) return; await api(`/compliance/evidence/${r.id}`, { method: 'DELETE' }); load(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Evidence</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Evidence title..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Evidence Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.evidenceType} onChange={e => setForm(f => ({ ...f, evidenceType: e.target.value }))}>
                  <option value="document">Document</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="config_export">Config Export</option>
                  <option value="log">Log</option>
                  <option value="attestation">Attestation</option>
                  <option value="link">Link</option>
                </select>
              </div>
              <div><Label>Collected Date</Label><Input type="date" value={form.collectedAt} onChange={e => setForm(f => ({ ...f, collectedAt: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this evidence..." /></div>
            {form.evidenceType === 'link' && (
              <div><Label>External URL</Label><Input value={form.externalUrl} onChange={e => setForm(f => ({ ...f, externalUrl: e.target.value }))} placeholder="https://..." /></div>
            )}
            <div><Label>Expiration Date</Label><Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.title} onClick={handleSave}>{saving ? 'Saving...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
