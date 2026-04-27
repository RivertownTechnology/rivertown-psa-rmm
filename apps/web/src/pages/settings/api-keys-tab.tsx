import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Key, Plus, X, Copy, AlertTriangle } from 'lucide-react';

export function ApiKeysTab() {
  interface ApiKeyRow { id: string; name: string; keyPrefix: string; scopes: string; isActive: boolean; lastUsedAt: string | null; expiresAt: string | null; createdAt: string; }
  const { confirm } = useConfirm();
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', scopes: '*', expiresAt: '' });
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{id: string; name: string} | null>(null);

  useEffect(() => { loadKeys(); }, []);
  async function loadKeys() {
    try { const data = await api<ApiKeyRow[]>('/settings/api-keys'); setKeys(Array.isArray(data) ? data : []); }
    catch { setKeys([]); }
  }

  async function createKey() {
    setSaving(true);
    try {
      const res = await api<any>('/settings/api-keys', { method: 'POST', body: JSON.stringify(form) });
      setNewKey(res.key);
      setShowCreate(false);
      setForm({ name: '', scopes: '*', expiresAt: '' });
      loadKeys();
    } catch (err: any) { toast.error('Failed to create API key', err.message); }
    finally { setSaving(false); }
  }

  async function revokeKey(id: string) {
    await api(`/settings/api-keys/${id}`, { method: 'DELETE' }).catch(() => {});
    loadKeys();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getStatusBadge(key: ApiKeyRow) {
    if (!key.isActive) return <Badge variant="destructive">Revoked</Badge>;
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return <Badge className="bg-yellow-500 hover:bg-yellow-600">Expired</Badge>;
    return <Badge className="bg-green-600 hover:bg-green-700">Active</Badge>;
  }

  return (
    <div className="space-y-4">
      {/* Warning banner when new key is generated */}
      {newKey && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-yellow-800 dark:text-yellow-200">Copy your API key now. It won't be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white dark:bg-gray-900 border rounded px-3 py-2 font-mono text-sm select-all break-all">{newKey}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKey)}>
                    <Copy className="h-4 w-4 mr-1" />
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setNewKey(null)} className="text-yellow-700">
                  <X className="h-4 w-4 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />API Keys</CardTitle>
              <CardDescription>Manage API keys for external integrations. Keys are hashed and cannot be retrieved after creation.</CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Generate API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No API keys yet. Generate one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Key</th>
                    <th className="py-2 pr-4 font-medium">Scopes</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last Used</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{k.name}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{k.keyPrefix}...</code>
                          <button onClick={() => copyToClipboard(k.keyPrefix)} className="text-muted-foreground hover:text-foreground" title="Copy prefix">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 pr-4"><code className="text-xs">{k.scopes}</code></td>
                      <td className="py-2 pr-4">{getStatusBadge(k)}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setRenameDialog({ id: k.id, name: k.name });
                          }}>Rename</Button>
                          {k.isActive && (
                            <Button size="sm" variant="outline" onClick={() => revokeKey(k.id)}>Revoke</Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={async () => {
                            const ok = await confirm({ title: 'Delete API Key?', description: `Permanently delete API key "${k.name}"? This cannot be undone.`, confirmLabel: 'Delete' });
                            if (!ok) return;
                            await api(`/settings/api-keys/${k.id}/permanent`, { method: 'DELETE' }).catch(() => {});
                            loadKeys();
                          }}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. N-central Integration" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Scopes</Label>
              <select className="w-full border rounded px-3 py-2 bg-background" value={form.scopes} onChange={e => setForm({ ...form, scopes: e.target.value })}>
                <option value="*">All (full access)</option>
                <option value="tickets:read,tickets:write">Tickets</option>
                <option value="tickets:read">Tickets (read-only)</option>
              </select>
            </div>
            <div>
              <Label>Expiration (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Leave empty for no expiration.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createKey} disabled={saving || !form.name}>
              {saving ? 'Generating...' : 'Generate Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename API Key Dialog */}
      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename API Key</DialogTitle>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!renameDialog) return;
            await api(`/settings/api-keys/${renameDialog.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameDialog.name }) }).catch(() => {});
            loadKeys();
            setRenameDialog(null);
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={renameDialog?.name ?? ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, name: e.target.value } : null)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={!renameDialog?.name}>Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
