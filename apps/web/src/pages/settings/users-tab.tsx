import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { User, X, Plus, CheckCircle } from 'lucide-react';

export function UsersTab() {
  interface UserRow { id: string; email: string; displayName: string; role: string; isActive: boolean; createdAt: string; }
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', displayName: '', role: 'tech', password: '' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try { const data = await api<UserRow[]>('/settings/users'); setUserList(Array.isArray(data) ? data : []); }
    catch { setUserList([]); }
  }

  async function addUser() {
    setSaving(true);
    try {
      const res = await api<{ id: string; email: string; displayName: string; role: string; tempPassword?: string }>('/settings/users', {
        method: 'POST',
        body: JSON.stringify({
          email: addForm.email,
          displayName: addForm.displayName,
          role: addForm.role,
          password: addForm.password || undefined,
        }),
      });
      if (res.tempPassword) setTempPassword(res.tempPassword);
      setShowAdd(false);
      setAddForm({ email: '', displayName: '', role: 'tech', password: '' });
      await loadUsers();
    } catch { /* */ }
    finally { setSaving(false); }
  }

  async function updateRole(id: string, role: string) {
    try {
      await api(`/settings/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setEditId(null);
      await loadUsers();
    } catch { /* */ }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api(`/settings/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
      await loadUsers();
    } catch { /* */ }
  }

  async function resetPassword(id: string) {
    try {
      const res = await api<{ tempPassword: string }>(`/settings/users/${id}/reset-password`, { method: 'POST' });
      setTempPassword(res.tempPassword);
    } catch { /* */ }
  }

  async function deactivateUser(id: string) {
    try {
      await api(`/settings/users/${id}`, { method: 'DELETE' });
      setDeactivateId(null);
      await loadUsers();
    } catch { /* */ }
  }

  const roleOptions = [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'tech', label: 'Technician' },
  ];

  function roleBadge(role: string) {
    const colors: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      tech: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300',
    };
    return <Badge className={colors[role] || colors.tech}>{role}</Badge>;
  }

  return (
    <div className="space-y-4">
      {tempPassword && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 p-4 rounded-md flex items-start justify-between">
          <div>
            <p className="font-medium">Temporary Password</p>
            <p className="text-sm mt-1 font-mono select-all">{tempPassword}</p>
            <p className="text-xs mt-1 text-muted-foreground">Please share this securely with the user. They should change it on first login.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setTempPassword(null)}><X className="h-4 w-4" /></Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />User Management</CardTitle>
            <CardDescription>Manage team members and their access roles</CardDescription>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Invite User</Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Role</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.map(u => (
                  <tr key={u.id} className={`border-b last:border-0 ${!u.isActive ? 'opacity-50' : ''}`}>
                    <td className="p-3 font-medium">{u.displayName}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      {editId === u.id ? (
                        <div className="flex items-center gap-2">
                          <Combobox
                            options={roleOptions}
                            value={editRole}
                            onValueChange={setEditRole}
                            placeholder="Select role"
                            className="w-[140px]"
                          />
                          <Button size="sm" variant="outline" onClick={() => updateRole(u.id, editRole)}>
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(u.id); setEditRole(u.role); }} className="cursor-pointer">
                          {roleBadge(u.role)}
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.isActive}
                        onClick={() => {
                          if (u.isActive) {
                            setDeactivateId(u.id);
                          } else {
                            toggleActive(u.id, true);
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${u.isActive ? 'bg-green-500' : 'bg-input'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${u.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => resetPassword(u.id)}>
                          Reset Password
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeactivateId(u.id)} disabled={!u.isActive}>
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {userList.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addUser(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="user@example.com" required />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={addForm.displayName} onChange={e => setAddForm({ ...addForm, displayName: e.target.value })} placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Combobox
                options={roleOptions}
                value={addForm.role}
                onValueChange={v => setAddForm({ ...addForm, role: v })}
                placeholder="Select role"
              />
            </div>
            <div className="space-y-2">
              <Label>Password (optional)</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} placeholder="Leave blank to auto-generate" />
              <p className="text-xs text-muted-foreground">If left blank, a temporary password will be generated.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateId}
        onOpenChange={() => setDeactivateId(null)}
        title="Deactivate User"
        description="This will deactivate the user and prevent them from logging in. You can reactivate them later."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={async () => { if (deactivateId) await deactivateUser(deactivateId); }}
      />
    </div>
  );
}
