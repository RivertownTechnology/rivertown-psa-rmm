import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Plus, Pencil, Trash2, Search } from 'lucide-react';

interface TaxRate {
  id: string; state: string; county: string | null; combinedRate: string;
  stateRate: string | null; countyRate: string | null;
  appliesToProducts: boolean; appliesToServices: boolean; isActive: boolean;
}

export function BillingSettingsTab() {
  const { confirm } = useConfirm();
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ state: '', county: '', combinedRate: '', stateRate: '', countyRate: '', appliesToProducts: true, appliesToServices: false });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadRates(); }, []);

  async function loadRates() {
    const data = await api<TaxRate[]>('/settings/tax-rates');
    setRates(data);
  }

  const filtered = rates.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.state.toLowerCase().includes(s) || (r.county?.toLowerCase().includes(s));
  });

  function openAdd() {
    setEditId(null);
    setForm({ state: '', county: '', combinedRate: '', stateRate: '', countyRate: '', appliesToProducts: true, appliesToServices: false });
    setShowAdd(true);
  }

  function openEdit(r: TaxRate) {
    setEditId(r.id);
    setForm({
      state: r.state, county: r.county ?? '', combinedRate: r.combinedRate,
      stateRate: r.stateRate ?? '', countyRate: r.countyRate ?? '',
      appliesToProducts: r.appliesToProducts, appliesToServices: r.appliesToServices,
    });
    setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      if (editId) {
        await api(`/settings/tax-rates/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/tax-rates', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowAdd(false); loadRates();
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete Tax Rate?', description: 'Are you sure you want to delete this tax rate?', confirmLabel: 'Delete' });
    if (!ok) return;
    await api(`/settings/tax-rates/${id}`, { method: 'DELETE' });
    loadRates();
  }

  async function seedRates() {
    setSeeding(true);
    try {
      const res = await api<{ created: number; total: number }>('/settings/tax-rates/seed', { method: 'POST', body: JSON.stringify({}) });
      setMessage(`Seeded ${res.created} of ${res.total} rates`);
      loadRates();
    } catch { setMessage('Seed failed'); }
    finally { setSeeding(false); }
  }

  // Group by state for display
  const stateGroups = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const arr = stateGroups.get(r.state) || [];
    arr.push(r);
    stateGroups.set(r.state, arr);
  }

  return (
    <div className="space-y-6 mt-4">
      {message && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">{message}</div>}


      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Tax Rates</CardTitle>
              <CardDescription>Manage sales tax rates by state and county. Rates auto-apply to invoices based on customer billing address.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={seedRates} disabled={seeding}>{seeding ? 'Seeding...' : 'Seed SC/NC Rates'}</Button>
              <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rate</Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by state or county..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No tax rates found. Click "Seed SC/NC Rates" to pre-populate, or add manually.</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">State</th>
                    <th className="text-left p-3 font-medium">County</th>
                    <th className="text-right p-3 font-medium">Combined</th>
                    <th className="text-right p-3 font-medium">State</th>
                    <th className="text-right p-3 font-medium">Local</th>
                    <th className="text-center p-3 font-medium">Products</th>
                    <th className="text-center p-3 font-medium">Services</th>
                    <th className="text-right p-3 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.state}</td>
                      <td className="p-3">{r.county || <span className="text-muted-foreground italic">State default</span>}</td>
                      <td className="p-3 text-right font-mono">{parseFloat(r.combinedRate).toFixed(2)}%</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{r.stateRate ? parseFloat(r.stateRate).toFixed(2) + '%' : '-'}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{r.countyRate ? parseFloat(r.countyRate).toFixed(2) + '%' : '-'}</td>
                      <td className="p-3 text-center">{r.appliesToProducts ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</td>
                      <td className="p-3 text-center">{r.appliesToServices ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-3 border-t text-xs text-muted-foreground">{filtered.length} rates{search ? ` matching "${search}"` : ''} ({rates.length} total)</div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Tax Rate' : 'Add Tax Rate'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>State Code</Label>
                <Input required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} placeholder="SC" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label>County (optional)</Label>
                <Input value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} placeholder="Horry" />
                <p className="text-xs text-muted-foreground">Leave blank for state-level default</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Combined Rate %</Label>
                <Input required type="number" step="0.01" value={form.combinedRate} onChange={e => setForm(f => ({ ...f, combinedRate: e.target.value }))} placeholder="8.00" />
              </div>
              <div className="space-y-2">
                <Label>State Rate %</Label>
                <Input type="number" step="0.01" value={form.stateRate} onChange={e => setForm(f => ({ ...f, stateRate: e.target.value }))} placeholder="6.00" />
              </div>
              <div className="space-y-2">
                <Label>Local Rate %</Label>
                <Input type="number" step="0.01" value={form.countyRate} onChange={e => setForm(f => ({ ...f, countyRate: e.target.value }))} placeholder="2.00" />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.appliesToProducts}
                  onClick={() => setForm(f => ({ ...f, appliesToProducts: !f.appliesToProducts }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.appliesToProducts ? 'bg-green-500' : 'bg-input'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${form.appliesToProducts ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <Label>Applies to Products</Label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.appliesToServices}
                  onClick={() => setForm(f => ({ ...f, appliesToServices: !f.appliesToServices }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.appliesToServices ? 'bg-green-500' : 'bg-input'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${form.appliesToServices ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <Label>Applies to Services</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Rate'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
