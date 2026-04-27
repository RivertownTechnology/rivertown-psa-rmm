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
import { UserCheck, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface PersonnelRecord {
  id: string; customerId: string | null; personName: string; personRole: string | null;
  screeningType: string; status: string; submittedDate: string | null; clearedDate: string | null;
  expirationDate: string | null; renewalDueDate: string | null; agencyOri: string | null; notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700', submitted: 'bg-blue-100 text-blue-700',
  cleared: 'bg-green-100 text-green-700', denied: 'bg-red-100 text-red-700',
  expired: 'bg-red-100 text-red-700', renewal_due: 'bg-yellow-100 text-yellow-700',
};

const emptyForm = { personName: '', personRole: '', screeningType: 'fingerprint', status: 'pending', customerId: '', submittedDate: '', clearedDate: '', expirationDate: '', renewalDueDate: '', agencyOri: '', notes: '' };

export function CompliancePersonnelPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [records, setRecords] = useState<PersonnelRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ customerId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    const data = await api<PersonnelRecord[]>(`/compliance/personnel?${params}`);
    setRecords(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any>('/customers?limit=100').then(d => setCustomers(d.data ?? [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  // Check for expiring soon (within 30 days)
  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 86400000);
  const expiringSoon = records.filter(r => r.expirationDate && new Date(r.expirationDate) <= soon && r.status === 'cleared').length;

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) {
        await api(`/compliance/personnel/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/compliance/personnel', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {expiringSoon > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-300">{expiringSoon} screening{expiringSoon > 1 ? 's' : ''} expiring within 30 days</span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 justify-between">
        <Combobox options={[{ value: '', label: 'All / Internal' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter({ customerId: v })} placeholder="All / Internal" className="w-48" />
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> Add Screening</Button>
      </div>

      {loading ? <Skeleton className="h-64" /> : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><UserCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No personnel screening records.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Person</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Cleared</th>
                <th className="text-left px-4 py-2 font-medium">Expires</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {records.map(r => {
                  const isExpiring = r.expirationDate && new Date(r.expirationDate) <= soon && r.status === 'cleared';
                  return (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 ${isExpiring ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-2 font-medium">{r.personName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.personRole || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.customerId ? custMap.get(r.customerId) || '—' : 'Internal'}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.screeningType.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-2"><Badge className={`${STATUS_COLORS[r.status] || ''} border-0 text-[10px]`}>{r.status.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-2 text-xs">{r.clearedDate || '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.expirationDate ? <span className={isExpiring ? 'text-yellow-700 font-medium' : ''}>{r.expirationDate}</span> : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(r.id); setForm({ personName: r.personName, personRole: r.personRole || '', screeningType: r.screeningType, status: r.status, customerId: r.customerId || '', submittedDate: r.submittedDate || '', clearedDate: r.clearedDate || '', expirationDate: r.expirationDate || '', renewalDueDate: r.renewalDueDate || '', agencyOri: r.agencyOri || '', notes: r.notes || '' }); setShowForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { const ok = await confirm({ title: 'Delete Screening?', description: 'This action cannot be undone.', confirmLabel: 'Delete' }); if (!ok) return; await api(`/compliance/personnel/${r.id}`, { method: 'DELETE' }); toast.success('Deleted successfully'); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editingId ? 'Edit Screening' : 'Add Screening'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Person Name</Label><Input value={form.personName} onChange={e => setForm(f => ({ ...f, personName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Input value={form.personRole} onChange={e => setForm(f => ({ ...f, personRole: e.target.value }))} placeholder="IT Admin, Officer..." /></div>
              <div><Label>Customer</Label><Combobox options={[{ value: '', label: 'Internal Staff' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))} placeholder="Internal..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Screening Type</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.screeningType} onChange={e => setForm(f => ({ ...f, screeningType: e.target.value }))}><option value="fingerprint">Fingerprint</option><option value="state_background">State Background</option><option value="federal_background">Federal Background</option><option value="cjis_certification">CJIS Certification</option><option value="hipaa_training">HIPAA Training</option></select></div>
              <div><Label>Status</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="pending">Pending</option><option value="submitted">Submitted</option><option value="cleared">Cleared</option><option value="denied">Denied</option><option value="expired">Expired</option><option value="renewal_due">Renewal Due</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Submitted</Label><Input type="date" value={form.submittedDate} onChange={e => setForm(f => ({ ...f, submittedDate: e.target.value }))} /></div>
              <div><Label>Cleared</Label><Input type="date" value={form.clearedDate} onChange={e => setForm(f => ({ ...f, clearedDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Expires</Label><Input type="date" value={form.expirationDate} onChange={e => setForm(f => ({ ...f, expirationDate: e.target.value }))} /></div>
              <div><Label>Agency ORI</Label><Input value={form.agencyOri} onChange={e => setForm(f => ({ ...f, agencyOri: e.target.value }))} placeholder="SC0XXXXXX" /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.personName} onClick={handleSave}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
