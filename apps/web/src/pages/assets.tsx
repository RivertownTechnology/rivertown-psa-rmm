import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Monitor, Search, Wifi, WifiOff, Server, Laptop, Smartphone, HardDrive } from 'lucide-react';

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
  serialNumber: string | null;
  screenconnectOnline: boolean;
  screenconnectSessionId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
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
  }, []);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const onlineCount = assets.filter(a => a.screenconnectOnline).length;
  const totalPages = Math.ceil(total / 50);

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
            return (
              <div key={asset.id} className="rounded-lg border bg-card px-4 py-3 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                <div className="shrink-0">
                  <div className="relative">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${asset.screenconnectOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{asset.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{asset.assetType}</Badge>
                    {asset.screenconnectOnline ? (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-0 shrink-0">Online</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Offline</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <button className="hover:text-primary hover:underline" onClick={() => onNavigateToCustomer?.(asset.customerId)}>
                      {customerMap.get(asset.customerId) ?? 'Unknown'}
                    </button>
                    {asset.osName && <span>{asset.osName}</span>}
                    {asset.ipAddress && <span>{asset.ipAddress}</span>}
                    {asset.manufacturer && asset.model && <span>{asset.manufacturer} {asset.model}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs text-muted-foreground">
                  {asset.lastSeenAt && (
                    <div>Last seen: {new Date(asset.lastSeenAt).toLocaleDateString()}</div>
                  )}
                  {asset.serialNumber && <div className="font-mono">{asset.serialNumber}</div>}
                </div>
                {asset.screenconnectSessionId && (
                  <a
                    href={`https://rivertowntechnology.screenconnect.com/Host#Access/All%20Machines///${asset.screenconnectSessionId}/Join`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <Button variant="outline" size="sm" className="text-xs gap-1">
                      <Monitor className="h-3 w-3" /> Connect
                    </Button>
                  </a>
                )}
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
    </div>
  );
}
