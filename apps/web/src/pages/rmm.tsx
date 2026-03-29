import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Monitor, Server, Laptop, Printer, Smartphone, Router, X, Plus, Copy, Check, Download } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  assetType: string;
  osName: string | null;
  osVersion: string | null;
  status: string;
  ipAddress: string | null;
  macAddress: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  customerId: string;
  lastSeenAt: string | null;
}

interface Customer { id: string; name: string; }

interface PaginatedResponse {
  data: Asset[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const typeIcons: Record<string, typeof Monitor> = {
  workstation: Monitor,
  server: Server,
  laptop: Laptop,
  network_device: Router,
  printer: Printer,
  mobile: Smartphone,
};

const deviceTypes = ['', 'workstation', 'server', 'laptop', 'network_device', 'printer', 'mobile', 'other'];
const deviceStatuses = ['', 'active', 'retired', 'rma'];

function pushPath(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function RmmPage({ onNavigateToCustomer }: { onNavigateToCustomer: (id: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [assetType, setAssetType] = useState('');
  const [status, setStatus] = useState('');

  // Add Device dialog
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addDeviceCustomerId, setAddDeviceCustomerId] = useState('');
  const [addDeviceSiteId, setAddDeviceSiteId] = useState('');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [enrollmentResult, setEnrollmentResult] = useState<{ token: string; key: string } | null>(null);
  const [copied, setCopied] = useState('');

  const fetchAssets = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (search) params.set('search', search);
    if (customerId) params.set('customerId', customerId);
    if (assetType) params.set('assetType', assetType);
    if (status) params.set('status', status);
    const data = await api<PaginatedResponse>(`/assets?${params}`);
    setAssets(data.data);
    setTotal(data.pagination.total);
  }, [page, search, customerId, assetType, status]);

  useEffect(() => {
    api<{ data: Customer[] }>('/customers?limit=100').then(d => setCustomers(d.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const hasFilters = search || customerId || assetType || status;

  function clearFilters() {
    setSearch(''); setCustomerId(''); setAssetType(''); setStatus(''); setPage(1);
  }

  // Load sites when customer changes in add device dialog
  function onAddDeviceCustomerChange(custId: string) {
    setAddDeviceCustomerId(custId);
    setAddDeviceSiteId('');
    setEnrollmentResult(null);
    if (custId) {
      api<{ data: Array<{ id: string; name: string }> }>('/sites?customerId=' + custId + '&limit=100')
        .then(d => setSites(d.data)).catch(() => setSites([]));
    } else {
      setSites([]);
    }
  }

  async function generateEnrollment() {
    if (!addDeviceCustomerId) return;
    const data = await api<{ token: string; key: string }>('/rmm/enrollment-token', {
      method: 'POST',
      body: JSON.stringify({ customerId: addDeviceCustomerId, siteId: addDeviceSiteId || undefined }),
    });
    setEnrollmentResult(data);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  const apiBaseUrl = window.location.origin.replace(':5173', ':3000');
  const msiFilename = enrollmentResult ? 'RivertownRMM_' + enrollmentResult.key + '.msi' : '';
  const psScript = enrollmentResult ? [
    '# Rivertown RMM Agent Install Script',
    '# Run as Administrator',
    '$ErrorActionPreference = "Stop"',
    '',
    '# Configuration',
    '$Token = "' + enrollmentResult.token + '"',
    '$ApiUrl = "' + apiBaseUrl + '"',
    '$InstallPath = "C:\\Program Files\\Rivertown\\Agent"',
    '',
    '# Create directories',
    'New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null',
    'New-Item -ItemType Directory -Path "$env:ProgramData\\Rivertown\\Agent" -Force | Out-Null',
    '',
    '# Write config',
    '@{',
    '    AgentId = ""',
    '    TenantId = ""',
    '    CustomerId = ""',
    '    MqttBrokerUrl = ([System.Uri]$ApiUrl).Host',
    '    MqttBrokerPort = 1883',
    '    ApiBaseUrl = $ApiUrl',
    '    EnrollmentToken = $Token',
    '    IsEnrolled = $false',
    '} | ConvertTo-Json | Set-Content "$env:ProgramData\\Rivertown\\Agent\\agent-config.json"',
    '',
    '# Download agent (when hosted)',
    '# Invoke-WebRequest -Uri "$ApiUrl/downloads/RivertownAgent.exe" -OutFile "$InstallPath\\Rivertown.Agent.Core.exe"',
    '',
    '# Install as service',
    'if (Test-Path "$InstallPath\\Rivertown.Agent.Core.exe") {',
    '    sc.exe create RivertownRMMAgent binPath= "`"$InstallPath\\Rivertown.Agent.Core.exe`"" start= auto | Out-Null',
    '    sc.exe description RivertownRMMAgent "Rivertown RMM Agent" | Out-Null',
    '    Start-Service -Name RivertownRMMAgent',
    '    Write-Host "Agent installed and started!" -ForegroundColor Green',
    '} else {',
    '    Write-Host "Agent executable not found. Copy it to $InstallPath first." -ForegroundColor Yellow',
    '    Write-Host "Config has been written. Agent will enroll on first start." -ForegroundColor Yellow',
    '}',
  ].join('\n') : '';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, OS, IP, serial..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <select
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]"
            >
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={assetType}
              onChange={e => { setAssetType(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              <option value="">All Types</option>
              {deviceTypes.filter(Boolean).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[120px]"
            >
              <option value="">All Status</option>
              {deviceStatuses.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Devices ({total})</span>
            <Button size="sm" onClick={() => { setShowAddDevice(true); setEnrollmentResult(null); setAddDeviceCustomerId(''); }}>
              <Plus className="h-4 w-4 mr-1" />Add Device
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Device</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">OS</th>
                  <th className="text-left p-3 font-medium">IP Address</th>
                  <th className="text-left p-3 font-medium">Agent</th>
                  <th className="text-left p-3 font-medium">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const Icon = typeIcons[a.assetType] ?? Monitor;
                  return (
                    <tr key={a.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => pushPath(`/rmm/devices/${a.id}`)}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium text-primary hover:underline">{a.name}</div>
                            {(a.manufacturer || a.model) && (
                              <div className="text-xs text-muted-foreground">{[a.manufacturer, a.model].filter(Boolean).join(' ')}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          className="text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); onNavigateToCustomer(a.customerId); }}
                        >
                          {customerMap.get(a.customerId) ?? '-'}
                        </button>
                      </td>
                      <td className="p-3"><Badge variant="outline">{a.assetType.replace(/_/g, ' ')}</Badge></td>
                      <td className="p-3 text-muted-foreground">
                        {a.osName ? `${a.osName} ${a.osVersion ?? ''}`.trim() : '-'}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{a.ipAddress ?? '-'}</td>
                      <td className="p-3">
                        {(() => {
                          const isOnline = a.lastSeenAt && (Date.now() - new Date(a.lastSeenAt).getTime()) < 120000;
                          const hasAgent = !!a.lastSeenAt;
                          return hasAgent ? (
                            <div className="flex items-center gap-1.5">
                              <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className={`text-xs ${isOnline ? 'text-green-600' : 'text-red-500'}`}>{isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No Agent</span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  );
                })}
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {hasFilters ? 'No devices match your filters' : 'No devices yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">Page {page} of {Math.ceil(total / 50)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {/* Add Device Dialog */}
      <Dialog open={showAddDevice} onOpenChange={setShowAddDevice}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a customer and site, then generate an installer to deploy the Rivertown RMM agent.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Customer</Label>
                <select value={addDeviceCustomerId} onChange={e => onAddDeviceCustomerChange(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Site (optional)</Label>
                <select value={addDeviceSiteId} onChange={e => { setAddDeviceSiteId(e.target.value); setEnrollmentResult(null); }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Default site</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {!enrollmentResult ? (
              <Button onClick={generateEnrollment} disabled={!addDeviceCustomerId}>
                Generate Installer
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">
                  Enrollment key generated. Choose your install method below.
                </div>

                {/* MSI Download */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">Option 1: MSI Installer</div>
                        <div className="text-xs text-muted-foreground">Custom MSI with enrollment key built into the filename</div>
                      </div>
                      <Button size="sm" variant="outline" disabled>
                        <Download className="h-4 w-4 mr-1" />{msiFilename}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">MSI download available when agent build server is configured.</p>
                  </CardContent>
                </Card>

                {/* PowerShell Script */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">Option 2: PowerShell Script</div>
                        <div className="text-xs text-muted-foreground">Run as Administrator on the target device</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(psScript, 'ps')}>
                        {copied === 'ps' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                        {copied === 'ps' ? 'Copied!' : 'Copy Script'}
                      </Button>
                    </div>
                    <div className="bg-gray-950 text-green-400 font-mono text-xs p-3 rounded-md max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                      {psScript}
                    </div>
                  </CardContent>
                </Card>

                {/* Enrollment Token */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">Option 3: Manual Token</div>
                        <div className="text-xs text-muted-foreground">Use with the standalone installer script</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(enrollmentResult.token, 'token')}>
                        {copied === 'token' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                        {copied === 'token' ? 'Copied!' : 'Copy Token'}
                      </Button>
                    </div>
                    <textarea value={enrollmentResult.token} readOnly rows={3} className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 break-all resize-none" />
                    <p className="text-xs text-muted-foreground">Token expires in 24 hours. Key: <code className="bg-muted px-1 rounded">{enrollmentResult.key}</code></p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
