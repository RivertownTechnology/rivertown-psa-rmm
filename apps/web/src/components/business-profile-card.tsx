import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Building, Upload, Copy, Check, ExternalLink } from 'lucide-react';

interface Profile {
  businessName: string; businessAddress: string; businessCity: string;
  businessState: string; businessZip: string; businessPhone: string;
  businessEmail: string; businessWebsite: string; businessLogo: string;
  primaryColor: string; portalWelcomeText: string;
  // Read-only: surfaced by the API so we can show the branded portal URL.
  slug: string; portalBaseUrl: string;
}

const emptyProfile: Profile = {
  businessName: '', businessAddress: '', businessCity: '',
  businessState: '', businessZip: '', businessPhone: '',
  businessEmail: '', businessWebsite: '', businessLogo: '',
  primaryColor: '', portalWelcomeText: '',
  slug: '', portalBaseUrl: '',
};

export function BusinessProfileCard() {
  const [profile, setProfile] = useState<Profile>({ ...emptyProfile });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const portalUrl = profile.slug && profile.portalBaseUrl
    ? `${profile.portalBaseUrl.replace(/\/$/, '')}/${profile.slug}`
    : '';

  function copyPortalUrl() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    api<Profile>('/settings/business-profile')
      .then(setProfile)
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setMessage(null);
    try {
      await api('/settings/business-profile', { method: 'PUT', body: JSON.stringify(profile) });
      setMessage({ type: 'success', text: 'Business profile saved' });
      setTimeout(() => setMessage(null), 5000);
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save business profile' });
    } finally { setSaving(false); }
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
        {message && (
          <div className={`text-sm p-3 rounded-md border ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
            {message.text}
          </div>
        )}

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
          <Input value={profile.businessName} onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))} placeholder="Your MSP name" />
          <p className="text-xs text-muted-foreground">Shown on invoices, quotes, portal header, and in SMS verification codes.</p>
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

        <Separator />

        {/* Customer Portal branding */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Customer Portal</h3>
            <p className="text-xs text-muted-foreground">What your clients see when they log in to submit tickets, pay invoices, and approve quotes.</p>
          </div>

          {portalUrl && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">Your portal URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono break-all">{portalUrl}</code>
                <Button size="sm" variant="outline" onClick={copyPortalUrl} type="button">
                  {copied ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                </Button>
                <a href={portalUrl} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button size="sm" variant="ghost" type="button"><ExternalLink className="h-3 w-3" /></Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground">Send this link to new contacts when you enable portal access.</p>
            </div>
          )}

          <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <Label htmlFor="primary-color">Primary color</Label>
            <div className="flex items-center gap-2">
              <input
                id="primary-color"
                type="color"
                className="h-9 w-14 rounded border cursor-pointer"
                value={profile.primaryColor || '#2563eb'}
                onChange={(e) => setProfile(p => ({ ...p, primaryColor: e.target.value }))}
              />
              <Input
                value={profile.primaryColor}
                onChange={(e) => setProfile(p => ({ ...p, primaryColor: e.target.value }))}
                placeholder="#2563eb"
                className="max-w-[140px] font-mono text-sm"
              />
              {profile.primaryColor && (
                <Button size="sm" variant="ghost" type="button" onClick={() => setProfile(p => ({ ...p, primaryColor: '' }))}>
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome-text">Portal welcome text</Label>
            <textarea
              id="welcome-text"
              className="flex w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={profile.portalWelcomeText}
              onChange={(e) => setProfile(p => ({ ...p, portalWelcomeText: e.target.value }))}
              placeholder="Your direct line to IT support. Submit tickets, track progress, and manage your account — all in one place."
              maxLength={400}
            />
            <p className="text-xs text-muted-foreground">Shown on the portal login page under the headline.</p>
          </div>
        </div>

        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Business Information'}</Button>
      </CardContent>
    </Card>
  );
}
