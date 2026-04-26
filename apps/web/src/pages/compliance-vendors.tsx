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
import { Building2, Plus, Pencil, Trash2, AlertTriangle, FileCheck, FileWarning } from 'lucide-react';

interface VendorRecord {
  id: string; customerId: string; vendorName: string; vendorType: string;
  contactName: string | null; contactEmail: string | null;
  servicesProvided: string | null; dataAccess: string | null;
  agreementType: string | null; agreementStatus: string | null;
  agreementSignedDate: string | null; agreementExpirationDate: string | null;
  complianceCertifications: string[] | null; riskLevel: string | null;
  status: string | null; notes: string | null;
}

const VENDOR_TYPE_LABELS: Record<string, string> = {
  msp: 'MSP', cloud_provider: 'Cloud Provider', software_vendor: 'Software Vendor',
  subcontractor: 'Subcontractor', business_associate: 'Business Associate',
};

const AGREEMENT_STATUS_COLORS: Record<string, string> = {
  none: 'bg-gray-100 text-gray-700', draft: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700', signed: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
};

const DATA_ACCESS_LABELS: Record<string, string> = {
  cji: 'CJI', phi: 'PHI', cardholder: 'Cardholder', none: 'None',
};

const emptyForm = {
  vendorName: '', vendorType: 'software_vendor', contactName: '', contactEmail: '',
  servicesProvided: '', dataAccess: 'none', agreementType: 'none', agreementStatus: 'none',
  agreementSignedDate: '', agreementExpirationDate: '', complianceCertifications: '',
  riskLevel: 'low', status: 'active', notes: '', customerId: '',
};

export function ComplianceVendorsPage() {
  const [records, setRecords] = useState<VendorRecord[]>([]);
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
    const data = await api<VendorRecord[]>(`/compliance/vendors?${params}`);
    setRecords(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<any[]>('/compliance/scoped-customers').then(d => setCustomers(d ?? [])).catch(() => {});
  }, []);

  const custMap = new Map(customers.map(c => [c.id, c.name]));

  // Stats
  const totalVendors = records.length;
  const signedCount = records.filter(r => r.agreementStatus === 'signed').length;
  const today = new Date();
  const expiredAgreements = records.filter(r =>
    r.agreementStatus === 'expired' || (r.agreementExpirationDate && new Date(r.agreementExpirationDate) < today)
  ).length;
  const missingAgreements = records.filter(r =>
    r.dataAccess && r.dataAccess !== 'none' && r.agreementStatus !== 'signed'
  ).length;
  const warningCount = expiredAgreements + missingAgreements;

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        complianceCertifications: form.complianceCertifications
          ? form.complianceCertifications.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      };
      if (editingId) {
        await api(`/compliance/vendors/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/compliance/vendors', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this vendor?')) return;
    await api(`/compliance/vendors/${id}`, { method: 'DELETE' });
    load();
  }

  function openEdit(r: VendorRecord) {
    setEditingId(r.id);
    setForm({
      vendorName: r.vendorName, vendorType: r.vendorType,
      contactName: r.contactName || '', contactEmail: r.contactEmail || '',
      servicesProvided: r.servicesProvided || '', dataAccess: r.dataAccess || 'none',
      agreementType: r.agreementType || 'none', agreementStatus: r.agreementStatus || 'none',
      agreementSignedDate: r.agreementSignedDate || '', agreementExpirationDate: r.agreementExpirationDate || '',
      complianceCertifications: (r.complianceCertifications || []).join(', '),
      riskLevel: r.riskLevel || 'low', status: r.status || 'active',
      notes: r.notes || '', customerId: r.customerId || '',
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      {warningCount > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-300">
              {expiredAgreements > 0 && <>{expiredAgreements} expired agreement{expiredAgreements > 1 ? 's' : ''}</>}
              {expiredAgreements > 0 && missingAgreements > 0 && ' and '}
              {missingAgreements > 0 && <>{missingAgreements} vendor{missingAgreements > 1 ? 's' : ''} with data access but no signed agreement</>}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold">{totalVendors}</div>
          <div className="text-xs text-muted-foreground">Total Vendors</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center flex flex-col items-center">
          <div className="flex items-center gap-1"><FileCheck className="h-4 w-4 text-green-600" /><span className="text-2xl font-bold">{signedCount}</span></div>
          <div className="text-xs text-muted-foreground">Signed Agreements</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center flex flex-col items-center">
          <div className="flex items-center gap-1"><FileWarning className="h-4 w-4 text-red-600" /><span className="text-2xl font-bold">{expiredAgreements + missingAgreements}</span></div>
          <div className="text-xs text-muted-foreground">Expired / Missing</div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2 justify-between">
        <Combobox
          options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
          value={filter.customerId}
          onValueChange={v => setFilter({ customerId: v })}
          placeholder="All Customers"
          className="w-56"
        />
        <Button size="sm" onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Vendor
        </Button>
      </div>

      {loading ? <Skeleton className="h-64" /> : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No vendor records.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Vendor Name</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Data Access</th>
                <th className="text-left px-4 py-2 font-medium">Agreement</th>
                <th className="text-left px-4 py-2 font-medium">Risk</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {records.map(r => {
                  const hasDataNoAgreement = r.dataAccess && r.dataAccess !== 'none' && r.agreementStatus !== 'signed';
                  const isExpiredAgreement = r.agreementStatus === 'expired' || (r.agreementExpirationDate && new Date(r.agreementExpirationDate) < today);
                  return (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 ${hasDataNoAgreement || isExpiredAgreement ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.vendorName}</div>
                        {r.customerId && <div className="text-xs text-muted-foreground">{custMap.get(r.customerId) || ''}</div>}
                      </td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{VENDOR_TYPE_LABELS[r.vendorType] || r.vendorType}</Badge></td>
                      <td className="px-4 py-2">
                        {r.dataAccess && r.dataAccess !== 'none' ? (
                          <Badge className={`${r.dataAccess === 'cji' ? 'bg-blue-100 text-blue-700' : r.dataAccess === 'phi' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'} border-0 text-[10px]`}>
                            {DATA_ACCESS_LABELS[r.dataAccess] || r.dataAccess}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">None</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {r.agreementType && r.agreementType !== 'none' && <span className="text-xs text-muted-foreground uppercase">{r.agreementType}</span>}
                          <Badge className={`${AGREEMENT_STATUS_COLORS[r.agreementStatus || 'none'] || ''} border-0 text-[10px]`}>
                            {(r.agreementStatus || 'none').replace(/_/g, ' ')}
                          </Badge>
                          {isExpiredAgreement && <AlertTriangle className="h-3 w-3 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge className={`${RISK_COLORS[r.riskLevel || 'low'] || ''} border-0 text-[10px]`}>
                          {r.riskLevel || 'low'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-[10px]">{r.status || 'active'}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Vendor Name</Label><Input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.vendorType} onChange={e => setForm(f => ({ ...f, vendorType: e.target.value }))}>
                  <option value="msp">MSP</option>
                  <option value="cloud_provider">Cloud Provider</option>
                  <option value="software_vendor">Software Vendor</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="business_associate">Business Associate</option>
                </select>
              </div>
              <div>
                <Label>Customer</Label>
                <Combobox options={[{ value: '', label: 'Select...' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))} placeholder="Select..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} /></div>
            </div>
            <div><Label>Services Provided</Label><Input value={form.servicesProvided} onChange={e => setForm(f => ({ ...f, servicesProvided: e.target.value }))} placeholder="Cloud hosting, backup..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Access</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.dataAccess} onChange={e => setForm(f => ({ ...f, dataAccess: e.target.value }))}>
                  <option value="none">None</option>
                  <option value="cji">CJI</option>
                  <option value="phi">PHI</option>
                  <option value="cardholder">Cardholder</option>
                </select>
              </div>
              <div>
                <Label>Risk Level</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.riskLevel} onChange={e => setForm(f => ({ ...f, riskLevel: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="text-sm font-medium">Agreement</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Agreement Type</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.agreementType} onChange={e => setForm(f => ({ ...f, agreementType: e.target.value }))}>
                    <option value="none">None</option>
                    <option value="mca">MCA</option>
                    <option value="baa">BAA</option>
                    <option value="dpa">DPA</option>
                    <option value="nda">NDA</option>
                    <option value="isa">ISA</option>
                  </select>
                </div>
                <div>
                  <Label>Agreement Status</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.agreementStatus} onChange={e => setForm(f => ({ ...f, agreementStatus: e.target.value }))}>
                    <option value="none">None</option>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="signed">Signed</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Signed Date</Label><Input type="date" value={form.agreementSignedDate} onChange={e => setForm(f => ({ ...f, agreementSignedDate: e.target.value }))} /></div>
                <div><Label>Expiration Date</Label><Input type="date" value={form.agreementExpirationDate} onChange={e => setForm(f => ({ ...f, agreementExpirationDate: e.target.value }))} /></div>
              </div>
            </div>

            <div><Label>Compliance Certifications</Label><Input value={form.complianceCertifications} onChange={e => setForm(f => ({ ...f, complianceCertifications: e.target.value }))} placeholder="SOC 2, ISO 27001, HIPAA..." /></div>
            <div><Label>Status</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={saving || !form.vendorName || !form.customerId} onClick={handleSave}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
