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
import { ListChecks, Plus, Pencil, Trash2, Ticket } from 'lucide-react';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface PoamItem {
  id: string; customerId: string; frameworkId: string; controlId: string | null;
  poamNumber: number; finding: string; riskLevel: string; weakness: string | null;
  remediationPlan: string | null; status: string; ticketId: string | null;
  scheduledStartDate: string | null; scheduledEndDate: string | null; actualEndDate: string | null;
  notes: string | null; costEstimateCents: number | null;
}

const RISK_COLORS: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-green-100 text-green-700' };
const STATUS_COLORS: Record<string, string> = { open: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700', delayed: 'bg-red-100 text-red-700', completed: 'bg-green-100 text-green-700', accepted_risk: 'bg-purple-100 text-purple-700' };

export function CompliancePoamPage() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<PoamItem[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ customerId: '', status: '' });
  const [editingItem, setEditingItem] = useState<PoamItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.status) params.set('status', filter.status);
    const data = await api<PoamItem[]>(`/compliance/poam?${params}`);
    setItems(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<any>('/compliance/scoped-customers').then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {['open', 'in_progress', 'delayed', 'completed', 'accepted_risk'].map(s => {
          const count = items.filter(i => i.status === s).length;
          return (
            <Card key={s} className={`cursor-pointer ${filter.status === s ? 'border-primary' : ''}`} onClick={() => setFilter(f => ({ ...f, status: f.status === s ? '' : s }))}>
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{s.replace(/_/g, ' ')}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 justify-between">
        <Combobox options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={filter.customerId} onValueChange={v => setFilter(f => ({ ...f, customerId: v }))} placeholder="All Customers" className="w-48" />
      </div>

      {loading ? <Skeleton className="h-64" /> : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><ListChecks className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No POA&M items. Complete an assessment to generate them.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-4 py-2 font-medium">Finding</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-center px-4 py-2 font-medium">Risk</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">End Date</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{item.poamNumber}</td>
                    <td className="px-4 py-2 max-w-[300px]"><div className="truncate font-medium">{item.finding}</div>{item.weakness && <div className="text-xs text-muted-foreground truncate">{item.weakness}</div>}</td>
                    <td className="px-4 py-2 text-muted-foreground">{custMap.get(item.customerId) || '—'}</td>
                    <td className="px-4 py-2 text-center"><Badge className={`${RISK_COLORS[item.riskLevel] || ''} border-0 text-[10px]`}>{item.riskLevel}</Badge></td>
                    <td className="px-4 py-2"><Badge className={`${STATUS_COLORS[item.status] || ''} border-0 text-[10px]`}>{item.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{item.scheduledEndDate || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItem(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { const ok = await confirm({ title: 'Delete POA&M Item?', description: 'This action cannot be undone.', confirmLabel: 'Delete' }); if (!ok) return; await api(`/compliance/poam/${item.id}`, { method: 'DELETE' }); toast.success('Deleted successfully'); load(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>POA&M #{editingItem?.poamNumber}</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="space-y-3">
              <div><Label>Finding</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={editingItem.finding} onChange={e => setEditingItem({ ...editingItem, finding: e.target.value })} /></div>
              <div><Label>Remediation Plan</Label><textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={editingItem.remediationPlan || ''} onChange={e => setEditingItem({ ...editingItem, remediationPlan: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Risk Level</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={editingItem.riskLevel} onChange={e => setEditingItem({ ...editingItem, riskLevel: e.target.value })}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                <div><Label>Status</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={editingItem.status} onChange={e => setEditingItem({ ...editingItem, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="delayed">Delayed</option><option value="completed">Completed</option><option value="accepted_risk">Accepted Risk</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={editingItem.scheduledStartDate || ''} onChange={e => setEditingItem({ ...editingItem, scheduledStartDate: e.target.value })} /></div>
                <div><Label>End Date</Label><Input type="date" value={editingItem.scheduledEndDate || ''} onChange={e => setEditingItem({ ...editingItem, scheduledEndDate: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Input value={editingItem.notes || ''} onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={async () => { if (!editingItem) return; await api(`/compliance/poam/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(editingItem) }); setEditingItem(null); load(); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
