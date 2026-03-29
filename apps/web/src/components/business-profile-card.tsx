import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Building, Upload } from 'lucide-react';

interface Profile {
  businessName: string; businessAddress: string; businessCity: string;
  businessState: string; businessZip: string; businessPhone: string;
  businessEmail: string; businessWebsite: string; businessLogo: string;
}

const emptyProfile: Profile = {
  businessName: '', businessAddress: '', businessCity: '',
  businessState: '', businessZip: '', businessPhone: '',
  businessEmail: '', businessWebsite: '', businessLogo: '',
};

export function BusinessProfileCard() {
  const [profile, setProfile] = useState<Profile>({ ...emptyProfile });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api<Profile>('/settings/business-profile')
      .then(setProfile)
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/business-profile', { method: 'PUT', body: JSON.stringify(profile) });
      setSuccess('Business profile saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfile(p => ({ ...p, businessLogo: reader.result as string }));
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Business Information</CardTitle>
        <CardDescription>Your company details — used on invoices, quotes, and emails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">{success}</div>}

        {/* Logo */}
        <div className="space-y-2">
          <Label>Company Logo</Label>
          <div className="flex items-center gap-4">
            {profile.businessLogo ? (
              <div className="relative">
                <img src={profile.businessLogo} alt="Logo" className="h-16 max-w-[200px] object-contain border rounded-md p-1" />
                <button className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
                  onClick={() => setProfile(p => ({ ...p, businessLogo: '' }))}>x</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-4 py-2 border border-dashed rounded-md cursor-pointer hover:bg-muted/50 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Business Name</Label>
          <Input value={profile.businessName} onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))} placeholder="Rivertown MSP" />
        </div>

        <div className="space-y-2">
          <Label>Address</Label>
          <Input value={profile.businessAddress} onChange={e => setProfile(p => ({ ...p, businessAddress: e.target.value }))} placeholder="123 Main St, Suite 100" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={profile.businessCity} onChange={e => setProfile(p => ({ ...p, businessCity: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input value={profile.businessState} onChange={e => setProfile(p => ({ ...p, businessState: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>ZIP</Label>
            <Input value={profile.businessZip} onChange={e => setProfile(p => ({ ...p, businessZip: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={profile.businessPhone} onChange={e => setProfile(p => ({ ...p, businessPhone: e.target.value }))} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-2">
            <Label>Billing Email</Label>
            <Input type="email" value={profile.businessEmail} onChange={e => setProfile(p => ({ ...p, businessEmail: e.target.value }))} placeholder="billing@company.com" />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={profile.businessWebsite} onChange={e => setProfile(p => ({ ...p, businessWebsite: e.target.value }))} placeholder="https://company.com" />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Business Information'}</Button>
      </CardContent>
    </Card>
  );
}
