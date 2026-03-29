import { Fragment, useEffect, useState, useCallback, useRef, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Monitor, Cpu, HardDrive, Shield, Terminal, Play, ChevronDown, ChevronUp,
  Pencil, Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, XCircle, ExternalLink,
  Search, Server, Network, Package, ScanLine, TerminalSquare,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Agent {
  id: string;
  agentVersion: string;
  enrolledAt: string;
  lastHeartbeat: string | null;
  status: string;
}

interface Patch {
  id: string;
  kb: string;
  title: string;
  classification: string;
  severity: string;
  status: string;
}

interface Cve {
  id: string;
  cveId: string;
  cvssScore: number;
  severity: string;
  title: string;
  patchAvailable: boolean;
}

interface ScriptRun {
  id: string;
  name: string;
  status: string;
  exitCode: number | null;
  output: string | null;
  createdAt: string;
}

interface EdrStatus {
  provider: string;
  status: string;
  lastScan: string | null;
  threats: number;
}

interface EffectivePolicy {
  id: string;
  name: string;
}

interface Software {
  name: string;
  version: string;
  publisher: string | null;
  installDate: string | null;
}

interface DiskInfo {
  letter?: string;
  label?: string;
  model?: string;
  sizeGb?: number;
  totalGb?: number;
  freeGb?: number;
  sizeBytes?: number;
  freeBytes?: number;
  format?: string;
  type?: string;
  health?: string;
  smart?: string;
}

interface NetworkAdapter {
  name?: string;
  description?: string;
  type?: string;
  ipAddress?: string;
  macAddress?: string;
  speed?: string;
  dhcpEnabled?: boolean;
}

interface MemorySlot {
  slot?: string;
  sizeGB?: number;
  sizeMb?: number;
  type?: string;
  speed?: number | string;
  manufacturer?: string;
}

interface SystemInventory {
  cpu?: {
    name?: string;
    cores?: number;
    threads?: number;
    speedMhz?: number;
    speedMHz?: number;
  };
  memory?: {
    totalMb?: number;
    totalGB?: number;
    slots?: MemorySlot[];
  };
  disks?: DiskInfo[];
  networkAdapters?: NetworkAdapter[];
  os?: {
    name?: string;
    version?: string;
    build?: string;
    arch?: string;
  };
  domain?: {
    type?: string;
    name?: string;
  };
  bios?: {
    manufacturer?: string;
    version?: string;
  };
  antivirus?: {
    name?: string;
    enabled?: boolean;
    upToDate?: boolean;
    realTimeProtection?: boolean;
  };
  lastBoot?: string;
}

interface Device {
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
  customerName: string | null;
  lastSeenAt: string | null;
  agent: Agent | null;
  patches: Patch[];
  cves: Cve[];
  scripts: ScriptRun[];
  edrStatus: EdrStatus | null;
  effectivePolicy: EffectivePolicy | null;
  policySource: string | null;
  systemInventory: SystemInventory | null;
  software: Software[];
  lastInventoryAt: string | null;
}

interface PolicyOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function policySourceLabel(source: string | null): string {
  switch (source) {
    case 'device': return 'Device Override';
    case 'customer': return 'Customer';
    case 'default': return 'Tenant Default';
    default: return 'Unknown';
  }
}

function policySourceVariant(source: string | null): 'default' | 'secondary' | 'outline' {
  switch (source) {
    case 'device': return 'default';
    case 'customer': return 'secondary';
    default: return 'outline';
  }
}

function severityVariant(severity: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'destructive';
    case 'high': return 'destructive';
    case 'medium': return 'default';
    case 'low': return 'secondary';
    default: return 'outline';
  }
}

function patchStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'installed': return 'secondary';
    case 'pending': return 'outline';
    case 'failed': return 'destructive';
    case 'missing': return 'default';
    default: return 'outline';
  }
}

function cvssColor(score: number): string {
  if (score >= 9.0) return 'text-red-600 font-bold';
  if (score >= 7.0) return 'text-orange-600 font-semibold';
  if (score >= 4.0) return 'text-yellow-600';
  return 'text-green-600';
}

function scriptStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'success': return 'secondary';
    case 'running': return 'default';
    case 'failed': return 'destructive';
    case 'queued': return 'outline';
    default: return 'outline';
  }
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getDiskPct(disk: DiskInfo): number | null {
  const size = disk.totalGb ?? disk.sizeGb ?? (disk.sizeBytes ? disk.sizeBytes / 1073741824 : null);
  const free = disk.freeGb ?? (disk.freeBytes ? disk.freeBytes / 1073741824 : null);
  if (!size || free == null) return null;
  return (free / size) * 100;
}

function relativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h ago`;
}

function uptimeFromLastBoot(lastBoot: string | undefined): string {
  if (!lastBoot) return '-';
  return relativeTime(lastBoot).replace(' ago', '');
}

// ---------------------------------------------------------------------------
// Sub-components for overview cards
// ---------------------------------------------------------------------------

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={`font-medium text-right ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '-'}</dd>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  );
}

function BoolIndicator({ value, trueLabel, falseLabel }: { value?: boolean; trueLabel?: string; falseLabel?: string }) {
  if (value === undefined || value === null) return <span className="text-muted-foreground">-</span>;
  return value ? (
    <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
      <CheckCircle className="h-3.5 w-3.5" />{trueLabel ?? 'Yes'}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
      <XCircle className="h-3.5 w-3.5" />{falseLabel ?? 'No'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RmmDeviceDetailPage({ deviceId, onBack }: { deviceId: string; onBack: () => void }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  // Software search
  const [softwareSearch, setSoftwareSearch] = useState('');

  // Script run dialog
  const [showRunScript, setShowRunScript] = useState(false);
  const [scriptName, setScriptName] = useState('');
  const [scriptContent, setScriptContent] = useState('');
  const [runningScript, setRunningScript] = useState(false);

  // Script output expand
  const [expandedScript, setExpandedScript] = useState<string | null>(null);

  // Policy override
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Scan state
  const [scanningType, setScanningType] = useState<string | null>(null);

  // Remote desktop state
  const [remoteInfo, setRemoteInfo] = useState<any>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [showRemoteInline, setShowRemoteInline] = useState(false);

  // Terminal state
  const [termConnected, setTermConnected] = useState(false);
  const [termOutput, setTermOutput] = useState('');
  const [termInput, setTermInput] = useState('');
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const [termHistoryIdx, setTermHistoryIdx] = useState(-1);
  const termWsRef = useRef<WebSocket | null>(null);
  const termOutputRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDevice = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const d = await api<Device>(`/rmm/devices/${deviceId}`);
      setDevice(d);
    } catch {
      // handle error silently
    } finally {
      if (!silent) setLoading(false);
    }
  }, [deviceId]);

  // Initial load
  useEffect(() => { loadDevice(); }, [loadDevice]);

  // Poll every 5 seconds
  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadDevice(true);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      termWsRef.current?.close();
    };
  }, [loadDevice]);

  useEffect(() => {
    api<PolicyOption[]>('/rmm/policies')
      .then(d => setPolicies(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Load remote info when switching to remote tab
  useEffect(() => {
    if (tab === 'remote' && device?.agent && !remoteInfo) {
      setRemoteLoading(true);
      api(`/rmm/devices/${deviceId}/remote`).then(setRemoteInfo).catch(() => {}).finally(() => setRemoteLoading(false));
    }
  }, [tab, device]);

  // Auto-scroll terminal output
  useEffect(() => {
    if (termOutputRef.current) {
      termOutputRef.current.scrollTop = termOutputRef.current.scrollHeight;
    }
  }, [termOutput]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function triggerScan(scanType: string) {
    setScanningType(scanType);
    try {
      await api(`/rmm/devices/${deviceId}/scan`, {
        method: 'POST',
        body: JSON.stringify({ scanType }),
      });
      loadDevice(true);
    } finally {
      setScanningType(null);
    }
  }

  const [uninstalling, setUninstalling] = useState('');

  async function uninstallSoftware(softwareName: string) {
    setUninstalling(softwareName);
    const escapedName = softwareName.replace(/'/g, "''");
    const script = [
      '$ErrorActionPreference = "Continue"',
      'Write-Output "Searching for: ' + softwareName + '"',
      '',
      '# Method 1: Registry-based uninstall (fastest, most reliable)',
      '# Search machine-wide and all user hives',
      '$uninstallPaths = @("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*", "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*", "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*")',
      '',
      '# Also search all user profiles via HKU',
      'try {',
      '    New-PSDrive -Name HKU -PSProvider Registry -Root HKEY_USERS -ErrorAction SilentlyContinue | Out-Null',
      '    $userSids = Get-ChildItem "HKU:\\" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "S-1-5-21" -and $_.Name -notmatch "_Classes" }',
      '    foreach ($sid in $userSids) {',
      '        $uninstallPaths += "HKU:\\$($sid.PSChildName)\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"',
      '    }',
      '} catch {}',
      '',
      'Write-Output "Searching $($uninstallPaths.Count) registry paths..."',
      '$apps = Get-ItemProperty $uninstallPaths -ErrorAction SilentlyContinue | Where-Object {',
      "    $_.DisplayName -like '*" + escapedName + "*'",
      '}',
      '',
      'if ($apps) {',
      '    foreach ($app in $apps) {',
      '        Write-Output "Found: $($app.DisplayName) v$($app.DisplayVersion)"',
      '        if ($app.QuietUninstallString) {',
      '            Write-Output "Running quiet uninstall: $($app.QuietUninstallString)"',
      '            cmd /c "$($app.QuietUninstallString)" 2>&1',
      '        } elseif ($app.UninstallString) {',
      '            $uninstallCmd = $app.UninstallString',
      '            Write-Output "Running uninstall: $uninstallCmd"',
      '            if ($uninstallCmd -match "msiexec") {',
      '                $uninstallCmd = $uninstallCmd -replace "/I", "/X"',
      '                cmd /c "$uninstallCmd /quiet /norestart" 2>&1',
      '            } else {',
      '                cmd /c "$uninstallCmd /S /silent /quiet /norestart" 2>&1',
      '            }',
      '        } else {',
      '            Write-Output "No uninstall string found for: $($app.DisplayName)"',
      '        }',
      '        Write-Output "Uninstall command completed."',
      '    }',
      '} else {',
      '    Write-Output "Not found in registry. Trying winget..."',
      '    try {',
      '        $wingetResult = winget uninstall --name "' + escapedName + '" --silent --accept-source-agreements 2>&1',
      '        $wingetResult | ForEach-Object { Write-Output $_ }',
      '    } catch { Write-Output "winget not available or failed" }',
      '    Write-Output ""',
      '    Write-Output "Similar apps in registry:"',
      '    Get-ItemProperty $uninstallPaths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*' + escapedName.split(' ')[0] + '*" } | ForEach-Object { Write-Output "  - $($_.DisplayName)" }',
      '}',
    ].join('\n');

    try {
      await api('/rmm/devices/' + deviceId + '/run-script', {
        method: 'POST',
        body: JSON.stringify({ scriptContent: script, scriptName: 'Uninstall: ' + softwareName }),
      });
      setUninstalling('');
      setTab('scripts');
    } catch {
      setUninstalling('');
    }
  }

  async function runScript(e: FormEvent) {
    e.preventDefault();
    if (!scriptName.trim() || !scriptContent.trim()) return;
    setRunningScript(true);
    try {
      await api(`/rmm/devices/${deviceId}/run-script`, {
        method: 'POST',
        body: JSON.stringify({ name: scriptName, content: scriptContent }),
      });
      setShowRunScript(false);
      setScriptName('');
      setScriptContent('');
      loadDevice();
    } finally {
      setRunningScript(false);
    }
  }

  async function overridePolicy() {
    if (!selectedPolicyId) return;
    setSavingPolicy(true);
    try {
      await api(`/rmm/devices/${deviceId}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ policyId: selectedPolicyId }),
      });
      loadDevice();
    } finally {
      setSavingPolicy(false);
    }
  }

  async function clearPolicyOverride() {
    setSavingPolicy(true);
    try {
      await api(`/rmm/devices/${deviceId}/policy`, { method: 'DELETE' });
      loadDevice();
    } finally {
      setSavingPolicy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Terminal functions
  // ---------------------------------------------------------------------------

  function connectTerminal() {
    if (!device?.agent) return;
    const token = localStorage.getItem('accessToken');
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/rmm/agents/${device.agent.id}/terminal?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setTermConnected(true);
      setTermOutput('Connecting to PowerShell on ' + device.name + '...\n');
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          setTermOutput(prev => prev + msg.data);
          termOutputRef.current?.scrollTo(0, termOutputRef.current.scrollHeight);
        } else if (msg.type === 'error') {
          setTermOutput(prev => prev + '\n[ERROR] ' + msg.data + '\n');
        }
      } catch {}
    };

    ws.onclose = () => {
      setTermConnected(false);
      setTermOutput(prev => prev + '\n[Disconnected]\n');
    };

    ws.onerror = () => {
      setTermConnected(false);
      setTermOutput(prev => prev + '\n[Connection error]\n');
    };

    termWsRef.current = ws;
  }

  function disconnectTerminal() {
    termWsRef.current?.close();
    termWsRef.current = null;
    setTermConnected(false);
  }

  function sendTerminalInput(input: string) {
    if (termWsRef.current?.readyState === WebSocket.OPEN) {
      termWsRef.current.send(JSON.stringify({ type: 'input', data: input }));
      setTermOutput(prev => prev + input + '\n');
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const inv = device?.systemInventory;
  const agentOnline = device?.agent?.lastHeartbeat
    ? (Date.now() - new Date(device.agent.lastHeartbeat).getTime()) < 120000
    : false;
  const filteredSoftware = (device?.software ?? []).filter(s => {
    if (!softwareSearch) return true;
    const q = softwareSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.version?.toLowerCase().includes(q) ||
      s.publisher?.toLowerCase().includes(q)
    );
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-muted-foreground">Loading device...</div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back to Devices
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Device not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const riskScore = device.cves.length > 0
    ? Math.round(device.cves.reduce((sum, c) => sum + c.cvssScore, 0) / device.cves.length * 10) / 10
    : null;

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: 'RMM', href: '/rmm' },
        { label: device.name },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{device.name}</h1>
              {device.osName && (
                <Badge variant="outline">{device.osName}</Badge>
              )}
              <Badge variant={device.status === 'active' ? 'default' : device.status === 'rma' ? 'destructive' : 'secondary'}>
                {device.status}
              </Badge>
              {device.agent ? (
                agentOnline ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Wifi className="h-3 w-3" />Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <WifiOff className="h-3 w-3" />Offline
                  </span>
                )
              ) : (
                <span className="text-xs text-muted-foreground">No agent</span>
              )}
            </div>
            {device.customerName && (
              <p className="text-sm text-muted-foreground mt-0.5">{device.customerName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Scan dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={scanningType !== null}>
                <ScanLine className="h-4 w-4 mr-1" />
                {scanningType ? `Scanning ${scanningType}...` : 'Scan'}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>On-Demand Scans</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => triggerScan('inventory')}>
                <Server className="h-4 w-4 mr-2" />Inventory
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerScan('software')}>
                <Package className="h-4 w-4 mr-2" />Software
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerScan('disk')}>
                <HardDrive className="h-4 w-4 mr-2" />Disk
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerScan('windowsUpdates')}>
                <RefreshCw className="h-4 w-4 mr-2" />Windows Updates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" />Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="software">
            Software
            {device.software.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] leading-4">{device.software.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="patches">Patches</TabsTrigger>
          <TabsTrigger value="cves">CVEs</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="remote">Remote</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Overview Tab                                                       */}
        {/* ================================================================= */}
        <TabsContent value="overview">
          {!inv ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Server className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-1">No Inventory Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  System inventory has not been collected yet. Run an inventory scan to populate this data.
                </p>
                <Button size="sm" onClick={() => triggerScan('inventory')} disabled={scanningType !== null}>
                  <ScanLine className="h-4 w-4 mr-1" />Run Inventory Scan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* System Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Monitor className="h-4 w-4" />System
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Hostname" value={device.name} />
                    <InfoRow
                      label="OS"
                      value={
                        inv.os
                          ? [inv.os.name, inv.os.version, inv.os.build, inv.os.arch].filter(Boolean).join(' ')
                          : (device.osName ? `${device.osName} ${device.osVersion ?? ''}`.trim() : '-')
                      }
                    />
                    <InfoRow
                      label="Domain"
                      value={
                        inv.domain
                          ? `${inv.domain.type ? `(${inv.domain.type}) ` : ''}${inv.domain.name ?? '-'}`
                          : '-'
                      }
                    />
                    <InfoRow label="Last Boot" value={inv.lastBoot ? new Date(inv.lastBoot).toLocaleString() : '-'} />
                    <InfoRow label="Uptime" value={uptimeFromLastBoot(inv.lastBoot)} />
                    <InfoRow label="Serial Number" value={device.serialNumber} mono />
                    <InfoRow label="Asset Type" value={<Badge variant="outline">{device.assetType.replace(/_/g, ' ')}</Badge>} />
                  </dl>
                </CardContent>
              </Card>

              {/* Hardware Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4" />Hardware
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Manufacturer" value={device.manufacturer} />
                    <InfoRow label="Model" value={device.model} />
                    {inv.cpu && (
                      <>
                        <InfoRow label="CPU" value={inv.cpu.name} />
                        <InfoRow
                          label="Cores / Threads"
                          value={`${inv.cpu.cores ?? '-'} cores / ${inv.cpu.threads ?? '-'} threads`}
                        />
                        <InfoRow
                          label="Speed"
                          value={(() => { const s = inv.cpu.speedMhz ?? inv.cpu.speedMHz; return s ? `${(s / 1000).toFixed(2)} GHz` : '-'; })()}
                        />
                      </>
                    )}
                    {inv.memory && (
                      <>
                        <InfoRow label="Total Memory" value={(() => { const mb = inv.memory.totalMb; const gb = inv.memory.totalGB; return mb ? `${Math.round(mb / 1024)} GB (${mb} MB)` : gb ? `${gb} GB` : '-'; })()} />
                        {inv.memory.slots && inv.memory.slots.length > 0 && (
                          <div className="pt-1">
                            <dt className="text-muted-foreground mb-1">Memory Slots</dt>
                            <dd>
                              <div className="space-y-1">
                                {inv.memory.slots.map((slot, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                                    <span className="font-medium">{slot.slot}</span>
                                    <span>{slot.sizeMb ? `${Math.round(slot.sizeMb / 1024)} GB` : slot.sizeGB ? `${slot.sizeGB} GB` : '-'}</span>
                                    {slot.type && <span className="text-muted-foreground">{slot.type}</span>}
                                    {slot.speed && <span className="text-muted-foreground">{slot.speed}</span>}
                                    {slot.manufacturer && <span className="text-muted-foreground">{slot.manufacturer}</span>}
                                  </div>
                                ))}
                              </div>
                            </dd>
                          </div>
                        )}
                      </>
                    )}
                    {inv.bios && (
                      <>
                        <InfoRow label="BIOS Manufacturer" value={inv.bios.manufacturer} />
                        <InfoRow label="BIOS Version" value={inv.bios.version} />
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* Network Card */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="h-4 w-4" />Network Adapters
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {inv.networkAdapters && inv.networkAdapters.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Name</th>
                            <th className="text-left p-3 font-medium">Type</th>
                            <th className="text-left p-3 font-medium">IP Address</th>
                            <th className="text-left p-3 font-medium">MAC Address</th>
                            <th className="text-left p-3 font-medium">Speed</th>
                            <th className="text-left p-3 font-medium">DHCP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.networkAdapters.map((adapter, i) => (
                            <tr key={i} className="border-b hover:bg-muted/30">
                              <td className="p-3 font-medium">{adapter.name}</td>
                              <td className="p-3 text-muted-foreground">{adapter.type ?? '-'}</td>
                              <td className="p-3 font-mono text-xs">{adapter.ipAddress ?? '-'}</td>
                              <td className="p-3 font-mono text-xs">{adapter.macAddress ?? '-'}</td>
                              <td className="p-3">{adapter.speed ?? '-'}</td>
                              <td className="p-3">
                                {adapter.dhcpEnabled !== undefined ? (
                                  <Badge variant={adapter.dhcpEnabled ? 'secondary' : 'outline'}>
                                    {adapter.dhcpEnabled ? 'Yes' : 'No'}
                                  </Badge>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No network adapter data available.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Storage Card */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />Storage
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {inv.disks && inv.disks.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Drive</th>
                            <th className="text-left p-3 font-medium">Model</th>
                            <th className="text-right p-3 font-medium">Size</th>
                            <th className="text-right p-3 font-medium">Free</th>
                            <th className="text-right p-3 font-medium">Free %</th>
                            <th className="text-left p-3 font-medium">Type</th>
                            <th className="text-left p-3 font-medium">Format</th>
                            <th className="text-left p-3 font-medium">Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.disks.map((disk, i) => {
                            const sizeGb = disk.totalGb ?? disk.sizeGb ?? (disk.sizeBytes ? disk.sizeBytes / 1073741824 : null);
                            const freeGb = disk.freeGb ?? (disk.freeBytes ? disk.freeBytes / 1073741824 : null);
                            const freePct = sizeGb && freeGb ? Math.round((freeGb / sizeGb) * 100) : null;
                            return (
                              <tr key={i} className="border-b hover:bg-muted/30">
                                <td className="p-3 font-mono font-medium">{disk.letter ?? '-'}</td>
                                <td className="p-3">{disk.model ?? disk.label ?? '-'}</td>
                                <td className="p-3 text-right font-mono text-xs">{sizeGb ? `${sizeGb.toFixed(1)} GB` : '-'}</td>
                                <td className={`p-3 text-right font-mono text-xs ${freeGb != null && sizeGb ? (freeGb / sizeGb < 0.1 ? 'text-red-600' : freeGb / sizeGb < 0.2 ? 'text-yellow-600' : 'text-green-600') : ''}`}>
                                  {freeGb != null ? `${freeGb.toFixed(1)} GB` : '-'}
                                </td>
                                <td className={`p-3 text-right font-mono text-xs ${freePct != null ? (freePct < 10 ? 'text-red-600' : freePct < 20 ? 'text-yellow-600' : '') : ''}`}>
                                  {freePct !== null ? `${freePct}% free` : '-'}
                                </td>
                                <td className="p-3 text-muted-foreground">{disk.type ?? '-'}</td>
                                <td className="p-3 text-muted-foreground">{disk.format ?? '-'}</td>
                                <td className="p-3">
                                  {disk.health ? (
                                    <Badge variant={disk.health.toLowerCase() === 'healthy' || disk.health.toLowerCase() === 'ok' ? 'secondary' : 'destructive'}>
                                      {disk.health}
                                    </Badge>
                                  ) : disk.smart ? (
                                    <Badge variant={disk.smart.toLowerCase() === 'ok' ? 'secondary' : 'destructive'}>
                                      SMART: {disk.smart}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No disk data available.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Security Card (Antivirus) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />Security
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {inv.antivirus ? (
                    <dl className="space-y-3 text-sm">
                      <InfoRow label="Antivirus" value={inv.antivirus.name ?? '-'} />
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Enabled</dt>
                        <dd><BoolIndicator value={inv.antivirus.enabled} trueLabel="Enabled" falseLabel="Disabled" /></dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Definitions Up to Date</dt>
                        <dd><BoolIndicator value={inv.antivirus.upToDate} trueLabel="Up to Date" falseLabel="Outdated" /></dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Real-Time Protection</dt>
                        <dd><BoolIndicator value={inv.antivirus.realTimeProtection} trueLabel="Active" falseLabel="Inactive" /></dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <AlertTriangle className="h-5 w-5 mb-1 inline-block mr-1 opacity-60" />
                      No antivirus data available.
                    </div>
                  )}
                  {device.edrStatus && (
                    <div className="mt-4 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">EDR / Endpoint Detection</p>
                      <dl className="space-y-2 text-sm">
                        <InfoRow label="Provider" value={device.edrStatus.provider} />
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Status</dt>
                          <dd>
                            <Badge variant={device.edrStatus.status === 'active' ? 'default' : 'destructive'}>
                              {device.edrStatus.status}
                            </Badge>
                          </dd>
                        </div>
                        <InfoRow
                          label="Last Scan"
                          value={device.edrStatus.lastScan ? new Date(device.edrStatus.lastScan).toLocaleString() : 'Never'}
                        />
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Threats</dt>
                          <dd className={`font-medium ${device.edrStatus.threats > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {device.edrStatus.threats}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Agent Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4" />Agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {device.agent ? (
                    <dl className="space-y-2 text-sm">
                      <InfoRow label="Version" value={device.agent.agentVersion} />
                      <InfoRow label="Enrolled" value={new Date(device.agent.enrolledAt).toLocaleDateString()} />
                      <InfoRow
                        label="Last Heartbeat"
                        value={
                          device.agent.lastHeartbeat
                            ? `${new Date(device.agent.lastHeartbeat).toLocaleString()} (${relativeTime(device.agent.lastHeartbeat)})`
                            : 'Never'
                        }
                      />
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd>
                          {agentOnline ? (
                            <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                              <StatusDot ok={true} />Online
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <StatusDot ok={false} />Offline
                            </span>
                          )}
                        </dd>
                      </div>
                      <InfoRow
                        label="Last Inventory Scan"
                        value={
                          device.lastInventoryAt
                            ? `${new Date(device.lastInventoryAt).toLocaleString()} (${relativeTime(device.lastInventoryAt)})`
                            : 'Never'
                        }
                      />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">No agent installed on this device.</p>
                  )}
                </CardContent>
              </Card>

              {/* Policy Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />Policy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Effective Policy" value={device.effectivePolicy?.name ?? 'None'} />
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Source</dt>
                      <dd>
                        <Badge variant={policySourceVariant(device.policySource)}>
                          {policySourceLabel(device.policySource)}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 pt-3 border-t space-y-2">
                    <Label className="text-xs text-muted-foreground">Override Policy</Label>
                    <div className="flex gap-2">
                      <select
                        value={selectedPolicyId}
                        onChange={e => setSelectedPolicyId(e.target.value)}
                        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Select a policy...</option>
                        {(policies ?? []).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <Button size="sm" disabled={!selectedPolicyId || savingPolicy} onClick={overridePolicy}>
                        Apply
                      </Button>
                    </div>
                    {device.policySource === 'device' && (
                      <Button variant="ghost" size="sm" disabled={savingPolicy} onClick={clearPolicyOverride}>
                        Clear device override
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ================================================================= */}
        {/* Software Tab                                                       */}
        {/* ================================================================= */}
        <TabsContent value="software">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search software..."
                  value={softwareSearch}
                  onChange={e => setSoftwareSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerScan('software')}
                disabled={scanningType !== null}
              >
                <ScanLine className="h-4 w-4 mr-1" />
                {scanningType === 'software' ? 'Scanning...' : 'Scan Software'}
              </Button>
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Installed Software
                  {device.software.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{filteredSoftware.length} of {device.software.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {device.software.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Name</th>
                          <th className="text-left p-3 font-medium">Version</th>
                          <th className="text-left p-3 font-medium">Publisher</th>
                          <th className="text-left p-3 font-medium">Install Date</th>
                          <th className="w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSoftware.map((s, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{s.name}</td>
                            <td className="p-3 font-mono text-xs">{s.version ?? '-'}</td>
                            <td className="p-3 text-muted-foreground">{s.publisher ?? '-'}</td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {(() => {
                                if (!s.installDate) return '-';
                                // Handle YYYYMMDD format
                                if (/^\d{8}$/.test(s.installDate)) {
                                  const y = s.installDate.slice(0, 4);
                                  const m = s.installDate.slice(4, 6);
                                  const d = s.installDate.slice(6, 8);
                                  return `${m}/${d}/${y}`;
                                }
                                const parsed = new Date(s.installDate);
                                return isNaN(parsed.getTime()) ? s.installDate : parsed.toLocaleDateString();
                              })()}
                            </td>
                            <td className="p-3">
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                disabled={uninstalling === s.name}
                                onClick={() => uninstallSoftware(s.name)}>
                                {uninstalling === s.name ? 'Sending...' : 'Uninstall'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredSoftware.length === 0 && softwareSearch && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No software matching "{softwareSearch}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No software data — run a software scan to collect installed applications.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================= */}
        {/* Patches Tab                                                        */}
        {/* ================================================================= */}
        <TabsContent value="patches">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Patches ({device.patches.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {device.patches.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">KB</th>
                        <th className="text-left p-3 font-medium">Title</th>
                        <th className="text-left p-3 font-medium">Classification</th>
                        <th className="text-left p-3 font-medium">Severity</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {device.patches.map(p => (
                        <tr key={p.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{p.kb}</td>
                          <td className="p-3">{p.title}</td>
                          <td className="p-3 text-muted-foreground">{p.classification}</td>
                          <td className="p-3">
                            <Badge variant={severityVariant(p.severity)}>{p.severity}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={patchStatusVariant(p.status)}>{p.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No patch data — agent needs to scan
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* CVEs Tab                                                           */}
        {/* ================================================================= */}
        <TabsContent value="cves">
          {riskScore !== null && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">Average CVSS Risk Score</div>
                  <div className={`text-2xl font-bold ${cvssColor(riskScore)}`}>{riskScore}</div>
                  <div className="text-sm text-muted-foreground">across {device.cves.length} vulnerabilities</div>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CVEs ({device.cves.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {device.cves.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">CVE ID</th>
                        <th className="text-left p-3 font-medium">CVSS Score</th>
                        <th className="text-left p-3 font-medium">Severity</th>
                        <th className="text-left p-3 font-medium">Title</th>
                        <th className="text-left p-3 font-medium">Patch Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {device.cves.map(c => (
                        <tr key={c.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{c.cveId}</td>
                          <td className="p-3">
                            <span className={cvssColor(c.cvssScore)}>{c.cvssScore.toFixed(1)}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant={severityVariant(c.severity)}>{c.severity}</Badge>
                          </td>
                          <td className="p-3">{c.title}</td>
                          <td className="p-3">
                            {c.patchAvailable ? (
                              <Badge variant="secondary">
                                <CheckCircle className="h-3 w-3 mr-1" />Available
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <XCircle className="h-3 w-3 mr-1" />No
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No vulnerabilities detected
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Scripts Tab                                                        */}
        {/* ================================================================= */}
        <TabsContent value="scripts">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => triggerScan('inventory')} disabled={scanningType !== null}>
                  <ScanLine className="h-4 w-4 mr-1" />Scan Inventory
                </Button>
                <Button size="sm" variant="outline" onClick={() => triggerScan('software')} disabled={scanningType !== null}>
                  <Package className="h-4 w-4 mr-1" />Scan Software
                </Button>
                <Button size="sm" variant="outline" onClick={() => triggerScan('disk')} disabled={scanningType !== null}>
                  <HardDrive className="h-4 w-4 mr-1" />Scan Disk
                </Button>
              </div>
              <Button size="sm" onClick={() => setShowRunScript(true)}>
                <Play className="h-4 w-4 mr-1" />Run Script
              </Button>
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Script History ({device.scripts.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {device.scripts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Name</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-left p-3 font-medium">Exit Code</th>
                          <th className="text-left p-3 font-medium">Date</th>
                          <th className="text-left p-3 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {device.scripts.map(s => (
                          <Fragment key={s.id}>
                            <tr
                              className="border-b hover:bg-muted/30 cursor-pointer"
                              onClick={() => setExpandedScript(expandedScript === s.id ? null : s.id)}
                            >
                              <td className="p-3 font-medium">{s.name}</td>
                              <td className="p-3">
                                <Badge variant={scriptStatusVariant(s.status)}>{s.status}</Badge>
                              </td>
                              <td className="p-3 font-mono text-xs">{s.exitCode ?? '-'}</td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {new Date(s.createdAt).toLocaleString()}
                              </td>
                              <td className="p-3">
                                {expandedScript === s.id
                                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                }
                              </td>
                            </tr>
                            {expandedScript === s.id && (
                              <tr key={`${s.id}-output`}>
                                <td colSpan={5} className="p-3 bg-muted/20">
                                  <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto p-3 bg-muted rounded-md">
                                    {s.output ?? 'No output captured.'}
                                  </pre>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No scripts have been run on this device yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Run Script Dialog */}
          <Dialog open={showRunScript} onOpenChange={setShowRunScript}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run Script on {device.name}</DialogTitle>
              </DialogHeader>
              <form onSubmit={runScript} className="space-y-4">
                <div className="space-y-2">
                  <Label>Script Name</Label>
                  <Input
                    value={scriptName}
                    onChange={e => setScriptName(e.target.value)}
                    placeholder="e.g. Clear temp files"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>PowerShell Content</Label>
                  <textarea
                    value={scriptContent}
                    onChange={e => setScriptContent(e.target.value)}
                    placeholder="Write-Host 'Hello World'"
                    required
                    rows={8}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowRunScript(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={runningScript}>
                    {runningScript ? 'Running...' : 'Run Script'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ================================================================= */}
        {/* Terminal Tab                                                       */}
        {/* ================================================================= */}
        <TabsContent value="terminal">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">PowerShell Terminal</CardTitle>
                <div className="flex gap-2">
                  {!termConnected ? (
                    <Button size="sm" onClick={connectTerminal} disabled={!device?.agent}>
                      Connect
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={disconnectTerminal}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!device?.agent ? (
                <div className="text-center text-muted-foreground py-8">No agent connected to this device.</div>
              ) : !termConnected ? (
                <div className="text-center text-muted-foreground py-8">Click &quot;Connect&quot; to open a live PowerShell session on this device.</div>
              ) : (
                <div>
                  <div
                    ref={termOutputRef}
                    className="bg-gray-950 text-green-400 font-mono text-xs p-4 rounded-t-md h-96 overflow-y-auto whitespace-pre-wrap"
                    onClick={() => termInputRef.current?.focus()}
                  >
                    {termOutput}
                  </div>
                  <div className="flex bg-gray-950 rounded-b-md border-t border-gray-800">
                    <span className="text-green-400 font-mono text-xs p-2 select-none">PS&gt;</span>
                    <input
                      ref={termInputRef}
                      type="text"
                      className="flex-1 bg-transparent text-green-400 font-mono text-xs p-2 outline-none"
                      value={termInput}
                      onChange={e => setTermInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          sendTerminalInput(termInput);
                          setTermHistory(h => [...h, termInput]);
                          setTermHistoryIdx(-1);
                          setTermInput('');
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const newIdx = Math.min(termHistoryIdx + 1, termHistory.length - 1);
                          setTermHistoryIdx(newIdx);
                          if (newIdx >= 0) setTermInput(termHistory[termHistory.length - 1 - newIdx]);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const newIdx = Math.max(termHistoryIdx - 1, -1);
                          setTermHistoryIdx(newIdx);
                          setTermInput(newIdx >= 0 ? termHistory[termHistory.length - 1 - newIdx] : '');
                        }
                      }}
                      autoFocus
                      placeholder="Type a command..."
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Remote Tab                                                         */}
        {/* ================================================================= */}
        <TabsContent value="remote">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Remote Desktop</CardTitle>
            </CardHeader>
            <CardContent>
              {remoteInfo?.available ? (
                <div className="space-y-4">
                  <Button size="sm" onClick={() => window.open(remoteInfo.sessionUrl, '_blank')}>
                    <Monitor className="h-4 w-4 mr-1" />Launch ScreenConnect Session
                  </Button>
                  <p className="text-xs text-muted-foreground">Opens your ScreenConnect instance in a new tab with remote desktop, file transfer, and clipboard support.</p>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Monitor className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                  <div>
                    <h3 className="text-lg font-medium mb-1">Remote Desktop</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {remoteInfo?.reason ?? 'Configure ScreenConnect in Settings > Integrations to enable remote desktop, file transfer, and clipboard sharing.'}
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg text-left text-sm space-y-2 max-w-lg mx-auto">
                    <p className="font-medium">Supported Remote Access Tools:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li><strong>ScreenConnect (ConnectWise Control)</strong> — Self-hosted, full API, industry standard</li>
                      <li><strong>Splashtop</strong> — Cloud-hosted alternative (coming soon)</li>
                    </ul>
                    <p className="text-muted-foreground mt-2">Set up your ScreenConnect instance URL and API key in Settings to get started.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
