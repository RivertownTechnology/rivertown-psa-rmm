import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLockup } from '@/components/ui/brand-lockup';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LogOut, ShieldCheck } from 'lucide-react';

interface ChangePasswordProps {
  currentPassword: string;
  onChanged: () => void;
  onLogout: () => void;
}

export function ChangePassword({ currentPassword, onChanged, onLogout }: ChangePasswordProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isValid = newPassword.length >= 15 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true); setError('');
    try {
      await api('/portal/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <BrandLockup size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-1" />Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Change Your Password</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              You're using a temporary password. Please set a new password to continue.
            </p>
          </CardHeader>
          <CardContent>
            {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 15 characters"
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className={newPassword.length >= 15 ? 'text-green-600' : 'text-muted-foreground'}>
                    {newPassword.length}/15 characters
                  </span>
                  {newPassword.length > 0 && newPassword.length < 15 && (
                    <span className="text-destructive">Too short</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={!isValid || saving}>
                {saving ? 'Changing...' : 'Set New Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
