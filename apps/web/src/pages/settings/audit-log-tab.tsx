import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AuditLogEntry {
  id: string;
  actorType: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function AuditLogTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  async function loadAuditLog(page = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      const res = await api<AuditLogResponse>(`/settings/audit-log?${params}`);
      setEntries(res.data);
      setPagination(res.pagination);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAuditLog(); }, [actionFilter, entityTypeFilter]);

  function formatTimestamp(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Log</CardTitle>
          <CardDescription>Track all actions performed in your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Entity Type</Label>
              <select
                value={entityTypeFilter}
                onChange={e => { setEntityTypeFilter(e.target.value); }}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All</option>
                <option value="ticket">Ticket</option>
                <option value="customer">Customer</option>
                <option value="contract">Contract</option>
                <option value="invoice">Invoice</option>
                <option value="quote">Quote</option>
                <option value="contact">Contact</option>
                <option value="user">User</option>
                <option value="asset">Asset</option>
                <option value="time_entry">Time Entry</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Input
                placeholder="e.g. ticket.created"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="h-9 w-48"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Timestamp</th>
                  <th className="text-left p-3 font-medium">Action</th>
                  <th className="text-left p-3 font-medium">Actor</th>
                  <th className="text-left p-3 font-medium">Entity Type</th>
                  <th className="text-left p-3 font-medium">Entity ID</th>
                  <th className="text-left p-3 font-medium">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No audit log entries found.</td></tr>
                ) : entries.map(entry => (
                  <tr key={entry.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{formatTimestamp(entry.createdAt)}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs font-mono">{entry.action}</Badge></td>
                    <td className="p-3">{entry.actorName}</td>
                    <td className="p-3"><Badge variant="secondary" className="text-xs capitalize">{entry.entityType}</Badge></td>
                    <td className="p-3 text-muted-foreground font-mono text-xs max-w-[120px] truncate" title={entry.entityId}>{entry.entityId.slice(0, 8)}...</td>
                    <td className="p-3 text-muted-foreground text-xs">{entry.ipAddress ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => loadAuditLog(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadAuditLog(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
