import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Plus, Mail, Phone, MapPin, Monitor, Ticket, FileText, Pencil, Trash2, Globe, Key } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Combobox } from '@/components/ui/combobox';

function pushPath(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

interface Customer {
  id: string; name: string; status: string; billingEmail: string | null; ccBillingEmail: string | null;
  phone: string | null; address: string | null; city: string | null; state: string | null;
  zip: string | null; county: string | null; website: string | null; notes: string | null; createdAt: string;
}
interface Contract { id: string; name: string; contractType: string; status: string; startDate: string; endDate: string | null; billingCycle: string; }
interface Invoice { id: string; invoiceNumber: number; status: string; issueDate: string; dueDate: string; totalCents: number; amountPaidCents: number; notes: string | null; }
interface Contact { id: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null; isPrimary: boolean; portalEnabled: boolean; }
interface Site { id: string; name: string; addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null; }
interface Asset { id: string; name: string; assetType: string; osName: string | null; osVersion: string | null; status: string; ipAddress: string | null; manufacturer: string | null; model: string | null; }
interface TicketRow { id: string; ticketNumber: number; subject: string; status: string; priority: string; createdAt: string; }

const priorityColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = { low: 'secondary', medium: 'outline', high: 'default', critical: 'destructive' };
const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = { new: 'default', open: 'default', pending: 'outline', waiting_on_customer: 'secondary', resolved: 'secondary', closed: 'secondary' };

export function CustomerDetailPage({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [customerContracts, setCustomerContracts] = useState<Contract[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [tab, setTab] = useState('overview');
  const [slaPolicies, setSlaPolicies] = useState<Array<{ id: string; name: string }>>([]);

  // Customer edit
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [custForm, setCustForm] = useState({ name: '', billingEmail: '', ccBillingEmail: '', phone: '', address: '', city: '', state: '', zip: '', website: '', notes: '', ncentralName: '', screenconnectCompany: '' });

  // Contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', isPrimary: false });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  // Site form
  const [showAddSite, setShowAddSite] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: '', addressLine1: '', city: '', state: '', postalCode: '' });
  const [saving, setSaving] = useState(false);
  // Portal access
  const [portalConfirmContact, setPortalConfirmContact] = useState<{ id: string; name: string; email: string } | null>(null);
  const [portalEnabling, setPortalEnabling] = useState(false);
  const [portalMessage, setPortalMessage] = useState('');

  const load = useCallback(async () => {
    const [c, ct, s, a, t, con, inv] = await Promise.all([
      api<Customer>(`/customers/${customerId}`),
      api<{ data: Contact[] }>(`/contacts?customerId=${customerId}&limit=100`),
      api<{ data: Site[] }>(`/sites?customerId=${customerId}&limit=100`),
      api<{ data: Asset[] }>(`/assets?customerId=${customerId}&limit=100`),
      api<{ data: TicketRow[] }>(`/tickets?customerId=${customerId}&limit=100`),
      api<{ data: Contract[] }>(`/contracts?customerId=${customerId}&limit=100`),
      api<{ data: Invoice[] }>(`/invoices?customerId=${customerId}&limit=100`),
    ]);
    setCustomer(c);
    setContacts(ct.data);
    setSites(s.data);
    setAssets(a.data);
    setTickets(t.data);
    setCustomerContracts(con.data);
    setCustomerInvoices(inv.data);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api<Array<{ id: string; name: string }>>('/settings/sla-policies').then(setSlaPolicies).catch(() => {});
  }, []);

  async function addContact(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify({ ...contactForm, customerId }) });
      setShowAddContact(false); setContactForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', isPrimary: false }); load();
    } finally { setSaving(false); }
  }

  async function addSite(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api('/sites', { method: 'POST', body: JSON.stringify({ ...siteForm, customerId }) });
      setShowAddSite(false); setSiteForm({ name: '', addressLine1: '', city: '', state: '', postalCode: '' }); load();
    } finally { setSaving(false); }
  }

  async function deleteContact(id: string) {
    await api(`/contacts/${id}`, { method: 'DELETE' }); load();
  }

  async function disablePortal(contactId: string) {
    await api(`/contacts/${contactId}/portal-access`, { method: 'POST', body: JSON.stringify({ enabled: false }) });
    load();
  }

  async function confirmEnablePortal() {
    if (!portalConfirmContact) return;
    setPortalEnabling(true);
    try {
      await api(`/contacts/${portalConfirmContact.id}/portal-access`, { method: 'POST', body: JSON.stringify({ enabled: true }) });
      setPortalMessage(`Portal access enabled for ${portalConfirmContact.name}. A welcome email with login credentials has been sent to ${portalConfirmContact.email}.`);
      setPortalConfirmContact(null);
      load();
    } catch (e: unknown) {
      setPortalMessage(e instanceof Error ? e.message : 'Failed to enable portal access');
    } finally { setPortalEnabling(false); }
  }

  async function resetPortalPassword(contactId: string, contactName: string) {
    await api(`/contacts/${contactId}/portal-access`, { method: 'POST', body: JSON.stringify({ enabled: true }) });
    setPortalMessage(`Password reset for ${contactName}. A new temporary password has been emailed.`);
    load();
  }

  async function deleteSite(id: string) {
    await api(`/sites/${id}`, { method: 'DELETE' }); load();
  }

  function openEditCustomer() {
    if (!customer) return;
    setCustForm({
      name: customer.name, billingEmail: customer.billingEmail ?? '', ccBillingEmail: customer.ccBillingEmail ?? '',
      phone: customer.phone ?? '', address: customer.address ?? '', city: customer.city ?? '',
      state: customer.state ?? '', zip: customer.zip ?? '', website: customer.website ?? '', notes: customer.notes ?? '',
      ncentralName: (customer as any).ncentralName ?? '', screenconnectCompany: (customer as any).screenconnectCompany ?? '',
    });
    setShowEditCustomer(true);
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify({
        name: custForm.name, billingEmail: custForm.billingEmail || undefined, ccBillingEmail: custForm.ccBillingEmail || undefined,
        phone: custForm.phone || undefined, address: custForm.address || undefined, city: custForm.city || undefined,
        state: custForm.state || undefined, zip: custForm.zip || undefined, website: custForm.website || undefined,
        notes: custForm.notes || undefined,
        ncentralName: custForm.ncentralName || null, screenconnectCompany: custForm.screenconnectCompany || null,
      })});
      setShowEditCustomer(false); load();
    } finally { setSaving(false); }
  }

  function openEditContact(c: Contact) {
    setEditingContactId(c.id);
    setContactForm({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone ?? '', jobTitle: c.jobTitle ?? '', isPrimary: c.isPrimary });
    setShowAddContact(true);
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editingContactId) {
        await api(`/contacts/${editingContactId}`, { method: 'PATCH', body: JSON.stringify({
          firstName: contactForm.firstName, lastName: contactForm.lastName, email: contactForm.email,
          phone: contactForm.phone || undefined, jobTitle: contactForm.jobTitle || undefined, isPrimary: contactForm.isPrimary,
        })});
      } else {
        await api('/contacts', { method: 'POST', body: JSON.stringify({ ...contactForm, customerId }) });
      }
      setShowAddContact(false); setEditingContactId(null);
      setContactForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', isPrimary: false });
      load();
    } finally { setSaving(false); }
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card><CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent></Card>
          </div>
          <div className="space-y-4">
            <Card><CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </CardContent></Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Customers', href: '/customers' }, { label: customer.name }]} />
      {portalMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center justify-between">
          {portalMessage}
          <button onClick={() => setPortalMessage('')} className="text-green-600 hover:text-green-800 ml-2">x</button>
        </div>
      )}

      {/* Portal enable confirmation dialog */}
      <Dialog open={!!portalConfirmContact} onOpenChange={() => setPortalConfirmContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Portal Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Enable portal access for <strong>{portalConfirmContact?.name}</strong>?
            </p>
            <p className="text-sm text-muted-foreground">
              An email will be sent to <strong>{portalConfirmContact?.email}</strong> with a link to the customer portal and a temporary password. They will be required to change their password on first login.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortalConfirmContact(null)}>Cancel</Button>
            <Button onClick={confirmEnablePortal} disabled={portalEnabling}>
              {portalEnabling ? 'Enabling...' : 'Yes, Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-xl font-semibold">{customer.name}</h2>
        <Button variant="outline" size="sm" onClick={openEditCustomer}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
        {!(customer as any).ncentralName && (
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const res = await api<any>(`/customers/${customerId}/create-in-ncentral`, { method: 'POST' });
              if (res.success) { alert(`Created in N-central as "${res.ncentralName}"`); load(); }
              else alert(res.error || 'Failed');
            } catch (e: any) { alert(e.message || 'Failed'); }
          }}>Create in N-central</Button>
        )}
        {(customer as any).ncentralName && (
          <Badge variant="outline" className="text-xs">N-central: {(customer as any).ncentralName}</Badge>
        )}
        <Combobox
          options={[
            {value: 'active', label: 'Active Client'},
            {value: 'inactive', label: 'Former Client'},
            {value: 'prospect', label: 'Prospective Client'},
          ]}
          value={customer.status}
          onValueChange={async (v) => {
            await api(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify({ status: v }) });
            load();
          }}
          placeholder="Select status..."
          className="w-40"
        />
        <Combobox
          options={[
            {value: '', label: 'SLA: Default'},
            ...slaPolicies.map(p => ({value: p.id, label: p.name})),
          ]}
          value={(customer as any).slaPolicyId ?? ''}
          onValueChange={async (v) => {
            await api(`/customers/${customerId}`, { method: 'PATCH', body: JSON.stringify({ slaPolicyId: v || null }) });
            load();
          }}
          placeholder="Select SLA..."
          className="w-44"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="sites">Sites ({sites.length})</TabsTrigger>
          <TabsTrigger value="devices">Devices ({assets.length})</TabsTrigger>
          <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({customerContracts.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({customerInvoices.length})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {customer.billingEmail && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span>{customer.billingEmail}</span></div>}
                {customer.ccBillingEmail && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">CC: {customer.ccBillingEmail}</span></div>}
                {customer.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{customer.phone}</div>}
                {customer.website && <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" />{customer.website}</div>}
                {(customer.address || customer.city) && (
                  <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>{customer.address && <div>{customer.address}</div>}{[customer.city, customer.state].filter(Boolean).join(', ')}{customer.zip ? ` ${customer.zip}` : ''}{customer.county ? <div className="text-xs text-muted-foreground">{customer.county} County</div> : ''}</div>
                  </div>
                )}
                <div className="text-muted-foreground">Created {new Date(customer.createdAt).toLocaleDateString()}</div>
                {customer.notes && <div className="pt-2 border-t"><p className="text-muted-foreground">{customer.notes}</p></div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Contacts</span><span className="font-medium">{contacts.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sites</span><span className="font-medium">{sites.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Devices</span><span className="font-medium">{assets.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Open Tickets</span><span className="font-medium">{tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Active Contracts</span><span className="font-medium">{customerContracts.filter(c => c.status === 'active').length}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CONTACTS */}
        <TabsContent value="contacts">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditingContactId(null); setContactForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', isPrimary: false }); setShowAddContact(true); }}><Plus className="h-4 w-4 mr-1" />Add Contact</Button>
            </div>
            {contacts.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No contacts yet</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contacts.map(c => (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{c.firstName} {c.lastName} {c.isPrimary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}</div>
                          {c.jobTitle && <div className="text-xs text-muted-foreground">{c.jobTitle}</div>}
                          <div className="text-sm text-muted-foreground mt-1">{c.email}</div>
                          {c.phone && <div className="text-sm text-muted-foreground">{c.phone}</div>}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditContact(c)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteContact(c.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      {/* Portal Access Section */}
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Portal Access</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.portalEnabled ? (
                              <>
                                <Badge variant="default" className="text-xs">Enabled</Badge>
                                {(c as any).portalRole === 'admin' && <Badge variant="outline" className="text-xs">Admin</Badge>}
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => resetPortalPassword(c.id, `${c.firstName} ${c.lastName}`)}>
                                  <Key className="h-3 w-3 mr-1" />Reset Password
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => disablePortal(c.id)}>
                                  Disable
                                </Button>
                              </>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPortalConfirmContact({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email })}>
                                <Globe className="h-3 w-3 mr-1" />Enable Portal
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* SITES */}
        <TabsContent value="sites">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAddSite(true)}><Plus className="h-4 w-4 mr-1" />Add Site</Button>
            </div>
            {sites.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No sites yet</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sites.map(s => (
                  <Card key={s.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{s.name}</div>
                          {s.addressLine1 && <div className="text-sm text-muted-foreground mt-1">{s.addressLine1}</div>}
                          {(s.city || s.state) && <div className="text-sm text-muted-foreground">{[s.city, s.state, s.postalCode].filter(Boolean).join(', ')}</div>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteSite(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* DEVICES */}
        <TabsContent value="devices">
          <div className="mt-4">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">OS</th>
                    <th className="text-left p-3 font-medium">IP</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {assets.map(a => (
                      <tr key={a.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{a.name}</td>
                        <td className="p-3"><Badge variant="outline">{a.assetType}</Badge></td>
                        <td className="p-3 text-muted-foreground">{a.osName ? `${a.osName} ${a.osVersion ?? ''}`.trim() : '-'}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{a.ipAddress ?? '-'}</td>
                        <td className="p-3"><Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge></td>
                      </tr>
                    ))}
                    {assets.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No devices</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TICKETS */}
        <TabsContent value="tickets">
          <div className="mt-4">
            <div className="flex justify-end mb-2">
              <Button size="sm" onClick={() => pushPath('/tickets')}>
                <Plus className="h-4 w-4 mr-1" />New Ticket
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium w-16">#</th>
                    <th className="text-left p-3 font-medium">Subject</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Created</th>
                  </tr></thead>
                  <tbody>
                    {tickets.map(t => (
                      <tr key={t.id} className="border-b hover:bg-muted/30 cursor-pointer">
                        <td className="p-3 text-muted-foreground">{t.ticketNumber}</td>
                        <td className="p-3 font-medium">{t.subject}</td>
                        <td className="p-3"><Badge variant={statusColor[t.status] ?? 'secondary'}>{t.status.replace(/_/g, ' ')}</Badge></td>
                        <td className="p-3"><Badge variant={priorityColor[t.priority] ?? 'outline'}>{t.priority}</Badge></td>
                        <td className="p-3 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {tickets.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No tickets</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CONTRACTS */}
        <TabsContent value="contracts">
          <div className="mt-4">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Billing</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Start</th>
                    <th className="text-left p-3 font-medium">End</th>
                  </tr></thead>
                  <tbody>
                    {customerContracts.map(c => (
                      <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => pushPath(`/billing/contracts/${c.id}`)}>
                        <td className="p-3 font-medium text-primary hover:underline">{c.name}</td>
                        <td className="p-3"><Badge variant="outline">{c.contractType.replace(/_/g, ' ')}</Badge></td>
                        <td className="p-3 text-muted-foreground capitalize">{c.billingCycle}</td>
                        <td className="p-3"><Badge variant={c.status === 'active' ? 'default' : c.status === 'draft' ? 'outline' : 'secondary'}>{c.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{c.startDate}</td>
                        <td className="p-3 text-muted-foreground">{c.endDate ?? 'Ongoing'}</td>
                      </tr>
                    ))}
                    {customerContracts.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No contracts</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices">
          <div className="mt-4">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Issue Date</th>
                    <th className="text-left p-3 font-medium">Due Date</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium">Paid</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                  </tr></thead>
                  <tbody>
                    {customerInvoices.map(inv => (
                      <tr key={inv.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => pushPath(`/billing/invoices/${inv.id}`)}>
                        <td className="p-3 font-medium text-primary hover:underline">INV-{inv.invoiceNumber}</td>
                        <td className="p-3"><Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'draft' ? 'outline' : inv.status === 'overdue' ? 'destructive' : 'secondary'}>{inv.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{inv.issueDate}</td>
                        <td className="p-3 text-muted-foreground">{inv.dueDate}</td>
                        <td className="p-3 text-right font-medium">${(inv.totalCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right text-muted-foreground">${(inv.amountPaidCents / 100).toFixed(2)}</td>
                        <td className="p-3 text-right font-medium">${((inv.totalCents - inv.amountPaidCents) / 100).toFixed(2)}</td>
                        <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{inv.notes ?? '-'}</td>
                      </tr>
                    ))}
                    {customerInvoices.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No invoices</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={(o) => { setShowAddContact(o); if (!o) setEditingContactId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingContactId ? 'Edit Contact' : 'Add Contact'}</DialogTitle></DialogHeader>
          <form onSubmit={saveContact} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>First Name</Label><Input required value={contactForm.firstName} onChange={e => setContactForm({ ...contactForm, firstName: e.target.value })} /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input required value={contactForm.lastName} onChange={e => setContactForm({ ...contactForm, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Job Title</Label><Input value={contactForm.jobTitle} onChange={e => setContactForm({ ...contactForm, jobTitle: e.target.value })} placeholder="IT Manager, CEO, Office Admin, etc." /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" required value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPrimary" checked={contactForm.isPrimary} onChange={e => setContactForm({ ...contactForm, isPrimary: e.target.checked })} className="h-4 w-4" />
              <Label htmlFor="isPrimary">Primary Contact</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowAddContact(false); setEditingContactId(null); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingContactId ? 'Save Contact' : 'Add Contact'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Site Dialog */}
      <Dialog open={showAddSite} onOpenChange={setShowAddSite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Site</DialogTitle></DialogHeader>
          <form onSubmit={addSite} className="space-y-4">
            <div className="space-y-2"><Label>Site Name</Label><Input required value={siteForm.name} onChange={e => setSiteForm({ ...siteForm, name: e.target.value })} placeholder="Main Office" /></div>
            <div className="space-y-2"><Label>Address</Label><Input value={siteForm.addressLine1} onChange={e => setSiteForm({ ...siteForm, addressLine1: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={siteForm.city} onChange={e => setSiteForm({ ...siteForm, city: e.target.value })} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={siteForm.state} onChange={e => setSiteForm({ ...siteForm, state: e.target.value })} /></div>
              <div className="space-y-2"><Label>ZIP</Label><Input value={siteForm.postalCode} onChange={e => setSiteForm({ ...siteForm, postalCode: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddSite(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Site'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={showEditCustomer} onOpenChange={setShowEditCustomer}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <form onSubmit={saveCustomer} className="space-y-4">
            <div className="space-y-2"><Label>Company Name</Label><Input required value={custForm.name} onChange={e => setCustForm({ ...custForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Billing Email</Label><Input type="email" value={custForm.billingEmail} onChange={e => setCustForm({ ...custForm, billingEmail: e.target.value })} /></div>
              <div className="space-y-2"><Label>CC Billing Email</Label><Input type="email" value={custForm.ccBillingEmail} onChange={e => setCustForm({ ...custForm, ccBillingEmail: e.target.value })} placeholder="Optional CC for invoices" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Phone</Label><Input value={custForm.phone} onChange={e => setCustForm({ ...custForm, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Website</Label><Input value={custForm.website} onChange={e => setCustForm({ ...custForm, website: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input value={custForm.address} onChange={e => setCustForm({ ...custForm, address: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={custForm.city} onChange={e => setCustForm({ ...custForm, city: e.target.value })} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={custForm.state} onChange={e => setCustForm({ ...custForm, state: e.target.value })} /></div>
              <div className="space-y-2"><Label>ZIP</Label><Input value={custForm.zip} onChange={e => setCustForm({ ...custForm, zip: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label>
              <textarea rows={3} value={custForm.notes} onChange={e => setCustForm({ ...custForm, notes: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Internal notes..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>N-central Name</Label><Input value={custForm.ncentralName} onChange={e => setCustForm({ ...custForm, ncentralName: e.target.value })} placeholder="Name in N-central (if different)" /></div>
              <div className="space-y-2"><Label>ScreenConnect Company</Label><Input value={custForm.screenconnectCompany} onChange={e => setCustForm({ ...custForm, screenconnectCompany: e.target.value })} placeholder="Company name in ScreenConnect" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditCustomer(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Customer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
