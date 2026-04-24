import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Monitor, Search, Server, Laptop, Smartphone, HardDrive, ExternalLink, Cpu, Globe, Hash, Calendar, ChevronRight } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  assetType: string;
  status: string;
  customerId: string;
  manufacturer: string | null;
  model: string | null;
  osName: string | null;
  osVersion: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  serialNumber: string | null;
  notes: string | null;
  externalRmmId: string | null;
  screenconnectOnline: boolean;
  screenconnectSessionId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Customer { id: string; name: string; }

const TYPE_ICONS: Record<string, typeof Monitor> = {
  workstation: Laptop,
  server: Server,
  laptop: Laptop,
  mobile: Smartphone,
  network: HardDrive,
};

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'workstation', label: 'Workstation' },
  { value: 'server', label: 'Server' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'network', label: 'Network' },
  { value: 'printer', label: 'Printer' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'retired', label: 'Retired' },
];

function isRecentlyOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff < 15 * 60 * 1000; // 15 minutes
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AssetsPage({ onNavigateToCustomer }: { onNavigateToCustomer?: (id: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [ncentralServerUrl, setNcentralServerUrl] = useState('');

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (typeFilter) params.set('assetType', typeFilter);
      if (customerFilter) params.set('customerId', customerFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api<any>(`/assets?${params}`);
      setAssets(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch { setAssets([]); }
    finally { setLoading(false); }
  }, [page, search, typeFilter, customerFilter, statusFilter]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100').then(d => setCustomers(d.data ?? [])).catch(() => {});
    // Get N-central server URL for device links
    api<{ serverUrl: string }>('/settings/ncentral').then(d => setNcentralServerUrl(d.serverUrl || '')).catch(() => {});
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const onlineCount = assets.filter(a => a.screenconnectOnline || isRecentlyOnline(a.lastSeenAt)).length;
  const totalPages = Math.ceil(total / 50);

  function getNcentralLink(deviceId: string): string | null {
    if (!ncentralServerUrl || !deviceId) return null;
    const base = ncentralServerUrl.replace(/\/+$/, '');
    return `${base}/#/deviceDetails/${deviceId}/dashboard`;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Total Assets</div>
          <div className="text-2xl font-bold">{total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Online</div>
          <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Offline</div>
          <div className="text-2xl font-bold text-gray-400">{assets.length - onlineCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Customers</div>
          <div className="text-2xl font-bold">{new Set(assets.map(a => a.customerId)).size}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Combobox
          options={TYPE_OPTIONS}
          value={typeFilter}
          onValueChange={v => { setTypeFilter(v); setPage(1); }}
          placeholder="All Types"
          className="w-40"
        />
        <Combobox
          options={[{ value: '', label: 'All Customers' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
          value={customerFilter}
          onValueChange={v => { setCustomerFilter(v); setPage(1); }}
          placeholder="All Customers"
          className="w-48"
        />
        <Combobox
          options={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={v => { setStatusFilter(v); setPage(1); }}
          placeholder="All Statuses"
          className="w-36"
        />
      </div>

      {/* Asset list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState icon={Monitor} title="No assets found" description="Assets are synced from RMM integrations or created manually." />
      ) : (
        <div className="space-y-2">
          {assets.map(asset => {
            const Icon = TYPE_ICONS[asset.assetType] ?? Monitor;
            const online = asset.screenconnectOnline || isRecentlyOnline(asset.lastSeenAt);
            return (
              <div
                key={asset.id}
                className="rounded-lg border bg-card px-4 py-3 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="shrink-0">
                  <div className="relative">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{asset.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{asset.assetType}</Badge>
                    {online ? (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-0 shrink-0">Online</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Offline</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <button className="hover:text-primary hover:underline" onClick={(e) => { e.stopPropagation(); onNavigateToCustomer?.(asset.customerId); }}>
                      {customerMap.get(asset.customerId) ?? 'Unknown'}
                    </button>
                    {asset.osName && <span>{asset.osName}</span>}
                    {asset.ipAddress && <span>{asset.ipAddress}</span>}
                    {asset.manufacturer && asset.model && <span>{asset.manufacturer} {asset.model}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs text-muted-foreground">
                  {asset.lastSeenAt && (
                    <div>Last seen: {timeAgo(asset.lastSeenAt)}</div>
                  )}
                  {asset.serialNumber && <div className="font-mono">{asset.serialNumber}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {asset.screenconnectSessionId && (
                    <a
                      href={`https://rivertowntechnology.screenconnect.com/Host#Access/All%20Machines///${asset.screenconnectSessionId}/Join`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      <Button variant="outline" size="sm" className="text-xs gap-1">
                        <Monitor className="h-3 w-3" /> SC
                      </Button>
                    </a>
                  )}
                  {asset.externalRmmId && getNcentralLink(asset.externalRmmId) && (
                    <a
                      href={getNcentralLink(asset.externalRmmId)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      <Button variant="outline" size="sm" className="text-xs gap-1">
                        <Globe className="h-3 w-3" /> NC
                      </Button>
                    </a>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {/* Asset Detail Dialog */}
      <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
        <DialogContent className="max-w-lg">
          {selectedAsset && (() => {
            const a = selectedAsset;
            const Icon = TYPE_ICONS[a.assetType] ?? Monitor;
            const online = a.screenconnectOnline || isRecentlyOnline(a.lastSeenAt);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {a.name}
                    {online ? (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-0">Online</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Offline</Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Quick Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow icon={Laptop} label="Type" value={a.assetType} />
                    <InfoRow icon={Hash} label="Status" value={a.status} />
                    <InfoRow icon={Globe} label="Customer" value={customerMap.get(a.customerId) ?? 'Unknown'} />
                    {a.ipAddress && <InfoRow icon={Globe} label="IP Address" value={a.ipAddress} />}
                  </div>

                  {/* Hardware */}
                  {(a.manufacturer || a.model || a.serialNumber) && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Hardware</div>
                      <div className="grid grid-cols-2 gap-3">
                        {a.manufacturer && <InfoRow icon={Cpu} label="Manufacturer" value={a.manufacturer} />}
                        {a.model && <InfoRow icon={Cpu} label="Model" value={a.model} />}
                        {a.serialNumber && <InfoRow icon={Hash} label="Serial Number" value={a.serialNumber} />}
                        {a.macAddress && <InfoRow icon={Hash} label="MAC Address" value={a.macAddress} />}
                      </div>
                    </div>
                  )}

                  {/* OS */}
                  {(a.osName || a.osVersion) && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Operating System</div>
                      <div className="grid grid-cols-2 gap-3">
                        {a.osName && <InfoRow icon={Monitor} label="OS" value={a.osName} />}
                        {a.osVersion && <InfoRow icon={Monitor} label="Version" value={a.osVersion} />}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Activity</div>
                    <div className="grid grid-cols-2 gap-3">
                      {a.lastSeenAt && <InfoRow icon={Calendar} label="Last Seen" value={timeAgo(a.lastSeenAt)} />}
                      <InfoRow icon={Calendar} label="Added" value={new Date(a.createdAt).toLocaleDateString()} />
                    </div>
                  </div>

                  {/* Notes */}
                  {a.notes && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Notes</div>
                      <p className="text-sm text-muted-foreground">{a.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    {a.screenconnectSessionId && (
                      <a
                        href={`https://rivertowntechnology.screenconnect.com/Host#Access/All%20Machines///${a.screenconnectSessionId}/Join`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Monitor className="h-3.5 w-3.5" /> Open in ScreenConnect
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                    {a.externalRmmId && getNcentralLink(a.externalRmmId) && (
                      <a
                        href={getNcentralLink(a.externalRmmId)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Globe className="h-3.5 w-3.5" /> Open in N-central
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                    <button
                      className="text-xs text-muted-foreground hover:text-primary hover:underline ml-auto"
                      onClick={() => { setSelectedAsset(null); onNavigateToCustomer?.(a.customerId); }}
                    >
                      View Customer
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Monitor; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}
