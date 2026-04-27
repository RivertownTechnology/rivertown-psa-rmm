import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface RiskItem {
  id: string; customerId: string; title: string; description: string | null;
  category: string | null; riskSource: string | null;
  likelihood: number; impact: number; riskScore: number;
  riskResponse: string; responseDetails: string | null;
  status: string; ownerId: string | null; reviewDate: string | null;
}

const RISK_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-800', 2: 'bg-green-100 text-green-800',
  3: 'bg-yellow-100 text-yellow-800', 4: 'bg-yellow-100 text-yellow-800',
  5: 'bg-orange-100 text-orange-800', 6: 'bg-orange-100 text-orange-800',
  8: 'bg-orange-100 text-orange-800', 9: 'bg-red-100 text-red-800',
  10: 'bg-red-100 text-red-800', 12: 'bg-red-100 text-red-800',
  15: 'bg-red-100 text-red-800', 16: 'bg-red-100 text-red-800',
  20: 'bg-red-200 text-red-900', 25: 'bg-red-200 text-red-900',
};
function riskColor(score: number) {
  return RISK_COLORS[score] || (score >= 15 ? 'bg-red-200 text-red-900' : score >= 8 ? 'bg-orange-100 text-orange-800' : score >= 4 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800');
}

const emptyForm = { title: '', description: '', category: 'technical', riskSource: 'manual', likelihood: '3', impact: '3', riskResponse: 'mitigate', responseDetails: '', customerId: '', reviewDate: '' };

export function ComplianceRisksPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ customerId: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.status) params.set('status', filter.status);
    const data = await api<RiskItem[]>(`/compliance/risks?${params}`);
    setRisks(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any>('/compliance/scoped-customers').then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...form, likelihood: parseInt(form.likelihood), impact: parseInt(form.impact) };
      if (editingId) {
        await api(`/compliance/risks/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/compliance/risks', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  // Build 5x5 heat map
  const heatMap: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  risks.filter(r => r.status !== 'closed').forEach(r => { heatMap[5 - r.impact][(r.likelihood - 1)] += 1; });

  return (
    <div className="space-y-4">
      {/* Heat Map */}
      <Card>
        <CardHeader><CardTitle className="text-base">Risk Heat Map</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="text-xs text-muted-foreground writing-mode-vertical flex items-center -rotate-180" style={{ writingMode: 'vertical-lr' }}>Impact</div>
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-1">
                {heatMap.map((row, ri) => row.map((count, ci) => {
                  const score = (5 - ri) * (ci + 1);
                  return (
                    <div key={`${ri}-${ci}`} className={`aspect-square rounded flex items-center justify-center text-xs font-medium ${count > 0 ? riskColor(score) : 'bg-muted/30 text-muted-foreground'}`}>
                      {count > 0 ? count : ''}
                    </div>
                  );
                }))}
              </div>
              <div className="text-xs text-muted-foreground text-center mt-1">Likelihood</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters + Actions */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex gap-2">
          <Combobox options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter(f => ({ ...f, customerId: v }))} placeholder="All Customers" className="w-48" />
          <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="mitigating">Mitigating</option>
            <option value="accepted">Accepted</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> Add Risk</Button>
      </div>

      {/* Risk Table */}
      {loading ? <Skeleton className="h-64" /> : risks.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No risks registered yet.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Risk</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-center px-4 py-2 font-medium">L</th>
                <th className="text-center px-4 py-2 font-medium">I</th>
                <th className="text-center px-4 py-2 font-medium">Score</th>
                <th className="text-left px-4 py-2 font-medium">Response</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {risks.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2"><div className="font-medium">{r.title}</div>{r.category && <Badge variant="outline" className="text-[10px] mt-0.5">{r.category}</Badge>}</td>
                    <td className="px-4 py-2 text-muted-foreground">{custMap.get(r.customerId) || '—'}</td>
                    <td className="px-4 py-2 text-center">{r.likelihood}</td>
                    <td className="px-4 py-2 text-center">{r.impact}</td>
                    <td className="px-4 py-2 text-center"><Badge className={`${riskColor(r.riskScore)} border-0`}>{r.riskScore}</Badge></td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.riskResponse}</Badge></td>
                    <td className="px-4 py-2"><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(r.id); setForm({ title: r.title, description: r.description || '', category: r.category || 'technical', riskSource: r.riskSource || 'manual', likelihood: String(r.likelihood), impact: String(r.impact), riskResponse: r.riskResponse, responseDetails: r.responseDetails || '', customerId: r.customerId, reviewDate: r.reviewDate || '' }); setShowForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { const ok = await confirm({ title: 'Delete Risk?', description: 'This action cannot be undone.', confirmLabel: 'Delete' }); if (!ok) return; await api(`/compliance/risks/${r.id}`, { method: 'DELETE' }); toast.success('Deleted successfully'); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Risk' : 'Add Risk'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer</Label><Combobox options={customers.map(c => ({ value: c.id, label: c.name }))} value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))} placeholder="Select customer..." /></div>
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Description</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}><option value="technical">Technical</option><option value="operational">Operational</option><option value="legal">Legal</option><option value="financial">Financial</option><option value="reputational">Reputational</option></select></div>
              <div><Label>Response</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.riskResponse} onChange={e => setForm(f => ({ ...f, riskResponse: e.target.value }))}><option value="mitigate">Mitigate</option><option value="accept">Accept</option><option value="avoid">Avoid</option><option value="transfer">Transfer</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Likelihood (1-5)</Label><Input type="number" min="1" max="5" value={form.likelihood} onChange={e => setForm(f => ({ ...f, likelihood: e.target.value }))} /></div>
              <div><Label>Impact (1-5)</Label><Input type="number" min="1" max="5" value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))} /></div>
            </div>
            <div className="text-center"><Badge className={`${riskColor(parseInt(form.likelihood) * parseInt(form.impact))} border-0 text-base px-4 py-1`}>Risk Score: {parseInt(form.likelihood) * parseInt(form.impact)}</Badge></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.title || !form.customerId} onClick={handleSave}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add Risk'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
