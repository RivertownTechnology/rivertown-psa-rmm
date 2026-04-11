import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User, Building, Bell, Hash, Mail, Send, CheckCircle, DollarSign, Shield, ShieldAlert, X, Package, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { BusinessProfileCard } from '@/components/business-profile-card';
import { SecurityPage } from './security';
import { ProductCatalogPage } from './product-catalog';
import { TemplatesSettingsPage } from './templates-settings';

interface EmailConfig {
  isEnabled: boolean; smtpHost: string; smtpPort: number; smtpUser: string;
  smtpPassword: string; fromAddress: string; fromName: string; useTls: boolean; provider: string;
}

const defaultEmail: EmailConfig = {
  isEnabled: false, smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '',
  fromAddress: '', fromName: '', useTls: true, provider: 'smtp',
};

export function SettingsPage({ initialTab }: { initialTab?: string } = {}) {
  const { user } = useAuth();
  const { mode, color, setMode, setColor } = useTheme();
  const hashTab = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  const [tab, setTab] = useState(initialTab || hashTab || 'general');
  function changeTab(t: string) { setTab(t); window.history.replaceState(null, '', `/settings#${t}`); }
  const [sequences, setSequences] = useState<Record<string, number>>({});
  const [seqForm, setSeqForm] = useState({ ticket: '', invoice: '', quote: '' });
  const [seqSaving, setSeqSaving] = useState(false);
  const [seqSuccess, setSeqSuccess] = useState('');

  // Billing rates
  interface TechRate { id: string; displayName: string; email: string; role: string; internalCostCents: number | null; billableRateCents: number | null; }
  const [orgRates, setOrgRates] = useState({ internalCostCents: 7500, billableRateCents: 15000 });
  const [techs, setTechs] = useState<TechRate[]>([]);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [ratesSuccess, setRatesSuccess] = useState('');

  // Email
  const [emailForm, setEmailForm] = useState<EmailConfig>({ ...defaultEmail });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailLoaded, setEmailLoaded] = useState(false);

  // Google Email
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email: string | null; configured: boolean; needsSetup: boolean; mailboxes: Array<{ email: string; displayName: string }> }>({ connected: false, email: null, configured: false, needsSetup: true, mailboxes: [] });
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [showGmailGuide, setShowGmailGuide] = useState(false);

  // Email-to-ticket
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [inboxResult, setInboxResult] = useState<{ processed: number; tickets: number; comments: number; blocked: number } | null>(null);
  const [emailLog, setEmailLog] = useState<Array<{ id: string; fromAddress: string; subject: string; direction: string; ticketId: string | null; createdAt: string }>>([]);

  // Blocked emails
  const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [newBlockedEmail, setNewBlockedEmail] = useState('');

  // Google Calendar (per-user)
  const [calConnected, setCalConnected] = useState(false);
  const [calConnecting, setCalConnecting] = useState(false);

  // Stripe
  const [stripeForm, setStripeForm] = useState({ secretKey: '', webhookSecret: '', publishableKey: '', isEnabled: false });
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeSuccess, setStripeSuccess] = useState('');

  // Pax8
  const [pax8Form, setPax8Form] = useState({ clientId: '', clientSecret: '', isEnabled: false, syncFrequency: 'daily' });
  const [pax8Loaded, setPax8Loaded] = useState(false);
  const [pax8Saving, setPax8Saving] = useState(false);
  const [pax8Success, setPax8Success] = useState('');
  const [pax8Testing, setPax8Testing] = useState(false);
  const [pax8TestResult, setPax8TestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pax8Status, setPax8Status] = useState<{ lastSyncAt: string | null; syncStatus: string; syncError: string | null }>({ lastSyncAt: null, syncStatus: 'idle', syncError: null });

  useEffect(() => {
    if (stripeLoaded) return;
    api<{ isEnabled: boolean; secretKey: string; webhookSecret: string; publishableKey: string }>('/settings/stripe')
      .then(data => { setStripeForm(data); setStripeLoaded(true); })
      .catch(() => setStripeLoaded(true));
  }, [stripeLoaded]);

  useEffect(() => {
    if (pax8Loaded) return;
    api<{ isEnabled: boolean; clientId: string; clientSecret: string; syncFrequency: string; lastSyncAt: string | null; syncStatus: string; syncError: string | null }>('/settings/pax8')
      .then(data => {
        setPax8Form({ clientId: data.clientId, clientSecret: data.clientSecret, isEnabled: data.isEnabled, syncFrequency: data.syncFrequency || 'daily' });
        setPax8Status({ lastSyncAt: data.lastSyncAt, syncStatus: data.syncStatus, syncError: data.syncError });
        setPax8Loaded(true);
      })
      .catch(() => setPax8Loaded(true));
  }, [pax8Loaded]);

  // SLA Policies
  interface SlaPolicy {
    id: string; name: string; description: string | null; isDefault: boolean;
    criticalResponseMinutes: number; criticalResolutionMinutes: number;
    highResponseMinutes: number; highResolutionMinutes: number;
    mediumResponseMinutes: number; mediumResolutionMinutes: number;
    lowResponseMinutes: number; lowResolutionMinutes: number;
  }
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [showSlaEdit, setShowSlaEdit] = useState(false);
  const [editingSlaId, setEditingSlaId] = useState<string | null>(null);
  const [slaForm, setSlaForm] = useState({
    name: '', description: '', isDefault: false,
    criticalResponseMinutes: '60', criticalResolutionMinutes: '240',
    highResponseMinutes: '240', highResolutionMinutes: '480',
    mediumResponseMinutes: '480', mediumResolutionMinutes: '1440',
    lowResponseMinutes: '1440', lowResolutionMinutes: '2880',
  });

  // Profile
  const [profileForm, setProfileForm] = useState({ displayName: '', currentPassword: '', newPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Notifications
  const [notifs, setNotifs] = useState({ ticketAssignment: true, slaWarning: true, rmmAlerts: true, invoicePayments: true });

  // Timezone
  const [timezone, setTimezone] = useState('America/New_York');

  useEffect(() => {
    api<{ timezone: string }>('/settings/timezone').then(d => setTimezone(d.timezone)).catch(() => {});
    api<{ connected: boolean }>('/integrations/google-calendar/status').then(d => setCalConnected(d.connected)).catch(() => {});

    // Handle calendar OAuth callback
    if (window.location.pathname === '/settings/calendar/callback') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        setCalConnecting(true);
        window.history.replaceState(null, '', '/settings');
        api<{ success: boolean }>('/integrations/google-calendar/callback', {
          method: 'POST', body: JSON.stringify({ code }),
        }).then(() => {
          setCalConnected(true);
        }).catch(() => {}).finally(() => setCalConnecting(false));
      }
    }
  }, []);

  async function saveTimezone(tz: string) {
    setTimezone(tz);
    await api('/settings/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: tz }) });
  }

  // Initialize profile form from user
  useEffect(() => {
    if (user) setProfileForm(f => ({ ...f, displayName: user.displayName }));
  }, [user]);

  // Load notification preferences from business profile
  useEffect(() => {
    api<Record<string, unknown>>('/settings/business-profile').then(d => {
      setNotifs({
        ticketAssignment: (d as any).notifTicketAssignment !== false,
        slaWarning: (d as any).notifSlaWarning !== false,
        rmmAlerts: (d as any).notifRmmAlerts !== false,
        invoicePayments: (d as any).notifInvoicePayments !== false,
      });
    }).catch(() => {});
  }, []);

  async function saveProfile() {
    setProfileSaving(true); setProfileMsg('');
    try {
      const payload: Record<string, string> = {};
      if (profileForm.displayName !== user?.displayName) payload.displayName = profileForm.displayName;
      if (profileForm.newPassword && profileForm.currentPassword) {
        payload.currentPassword = profileForm.currentPassword;
        payload.newPassword = profileForm.newPassword;
      }
      if (Object.keys(payload).length === 0) { setProfileMsg('No changes'); setProfileSaving(false); return; }
      await api('/settings/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      setProfileMsg('Profile saved');
      setProfileForm(f => ({ ...f, currentPassword: '', newPassword: '' }));
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? e.message : 'Failed to save');
    } finally { setProfileSaving(false); }
  }

  async function saveNotifications() {
    await api('/settings/business-profile', { method: 'PUT', body: JSON.stringify({
      notifTicketAssignment: notifs.ticketAssignment,
      notifSlaWarning: notifs.slaWarning,
      notifRmmAlerts: notifs.rmmAlerts,
      notifInvoicePayments: notifs.invoicePayments,
    })});
  }

  useEffect(() => {
    api<SlaPolicy[]>('/settings/sla-policies').then(setSlaPolicies).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ orgDefaults: { internalCostCents: number; billableRateCents: number }; techs: TechRate[] }>('/settings/billing-rates')
      .then(data => { setOrgRates(data.orgDefaults); setTechs(data.techs); })
      .catch(() => {});
  }, []);

  async function saveOrgRates() {
    setRatesSaving(true); setRatesSuccess('');
    try {
      await api('/settings/billing-rates/org', { method: 'PATCH', body: JSON.stringify(orgRates) });
      setRatesSuccess('Default rates saved');
    } catch { /* */ }
    finally { setRatesSaving(false); }
  }

  async function saveTechRate(userId: string, internalCostCents: number | null, billableRateCents: number | null) {
    await api(`/settings/billing-rates/tech/${userId}`, {
      method: 'PATCH', body: JSON.stringify({ internalCostCents, billableRateCents }),
    });
    setTechs(prev => prev.map(t => t.id === userId ? { ...t, internalCostCents, billableRateCents } : t));
  }

  useEffect(() => {
    api<Record<string, number>>('/settings/sequences')
      .then(data => {
        setSequences(data);
        setSeqForm({
          ticket: String(data.ticket ?? 0),
          invoice: String(data.invoice ?? 0),
          quote: String(data.quote ?? 0),
        });
      })
      .catch(() => {});
  }, []);

  async function saveSequences() {
    setSeqSaving(true);
    setSeqSuccess('');
    try {
      const data = await api<Record<string, number>>('/settings/sequences', {
        method: 'PATCH',
        body: JSON.stringify({
          ticket: parseInt(seqForm.ticket, 10),
          invoice: parseInt(seqForm.invoice, 10),
          quote: parseInt(seqForm.quote, 10),
        }),
      });
      setSequences(data);
      setSeqSuccess('Sequences updated. Next ticket will be #' + (data.ticket + 1));
    } catch { /* */ }
    finally { setSeqSaving(false); }
  }

  useEffect(() => {
    if (emailLoaded) return;
    api<EmailConfig>('/settings/email')
      .then(data => { setEmailForm(data); setEmailLoaded(true); })
      .catch(() => setEmailLoaded(true));
    api<{ connected: boolean; email: string | null; configured: boolean }>('/integrations/google-email/status')
      .then(data => setGmailStatus(s => ({ ...s, ...data }))).catch(() => {});
    if (!blockedLoaded) {
      api<{ blocked: string[] }>('/settings/email/blocked')
        .then(data => { setBlockedEmails(data.blocked); setBlockedLoaded(true); }).catch(() => setBlockedLoaded(true));
    }

    // Handle OAuth callback — if we have a ?code= in the URL, exchange it
    // Check both query string (Web redirect) and hash fragment (SPA redirect)
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = params.get('code') || hashParams.get('code');
    if (code) {
      setGmailConnecting(true);
      // Clean the URL (remove code from query string and hash)
      window.history.replaceState(null, '', '/settings');
      api<{ success: boolean; email: string }>('/integrations/google-email/callback', {
        method: 'POST', body: JSON.stringify({ code }),
      }).then(result => {
        setGmailStatus(s => ({ ...s, connected: true, email: result.email, configured: true }));
        setEmailSuccess(`Connected Gmail as ${result.email}`);
        setEmailLoaded(false);
      }).catch(e => {
        setEmailError(e instanceof Error ? e.message : 'Failed to complete Google email connection');
      }).finally(() => setGmailConnecting(false));
    }
  }, [emailLoaded]);

  async function saveEmail() {
    setEmailSaving(true); setEmailSuccess(''); setEmailError('');
    try {
      await api('/settings/email', { method: 'PUT', body: JSON.stringify(emailForm) });
      setEmailSuccess('Email settings saved');
    } catch (e: unknown) { setEmailError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setEmailSaving(false); }
  }

  async function connectGmail() {
    setGmailConnecting(true); setEmailError(''); setEmailSuccess('');
    try {
      const res = await api<{ authUrl: string }>('/integrations/google-email/authorize');
      window.location.href = res.authUrl;
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : 'Failed to start Google email connection');
      setGmailConnecting(false);
    }
  }

  async function disconnectGmail(targetEmail?: string) {
    try {
      await api('/integrations/google-email/disconnect', { method: 'POST', body: JSON.stringify({ email: targetEmail }) });
      if (targetEmail) {
        setGmailStatus(s => {
          const remaining = s.mailboxes.filter(m => m.email !== targetEmail);
          return { ...s, connected: remaining.length > 0, email: remaining[0]?.email ?? null, mailboxes: remaining };
        });
        setEmailSuccess(`Disconnected ${targetEmail}`);
      } else {
        setGmailStatus(s => ({ ...s, connected: false, email: null, mailboxes: [] }));
        setEmailSuccess('All Google mailboxes disconnected');
      }
      setEmailLoaded(false);
    } catch (e: unknown) { setEmailError(e instanceof Error ? e.message : 'Failed'); }
  }

  async function checkInbox() {
    setCheckingInbox(true); setInboxResult(null); setEmailError('');
    try {
      const result = await api<{ processed: number; tickets: number; comments: number; blocked: number }>('/settings/email/check-inbox', { method: 'POST', body: JSON.stringify({}) });
      setInboxResult(result);
      const parts = [`${result.tickets} new tickets`, `${result.comments} comments`];
      if (result.blocked) parts.push(`${result.blocked} blocked`);
      setEmailSuccess(`Processed ${result.processed} emails: ${parts.join(', ')}`);
    } catch (e: unknown) { setEmailError(e instanceof Error ? e.message : 'Failed to check inbox'); }
    finally { setCheckingInbox(false); }
  }

  async function addBlockedEmail() {
    const entry = newBlockedEmail.trim().toLowerCase();
    if (!entry || blockedEmails.includes(entry)) return;
    const updated = [...blockedEmails, entry];
    await api('/settings/email/blocked', { method: 'PUT', body: JSON.stringify({ blocked: updated }) });
    setBlockedEmails(updated);
    setNewBlockedEmail('');
  }

  async function removeBlockedEmail(email: string) {
    const updated = blockedEmails.filter(e => e !== email);
    await api('/settings/email/blocked', { method: 'PUT', body: JSON.stringify({ blocked: updated }) });
    setBlockedEmails(updated);
  }

  async function loadEmailLog() {
    const log = await api<Array<{ id: string; fromAddress: string; subject: string; direction: string; ticketId: string | null; createdAt: string }>>('/settings/email/log');
    setEmailLog(log);
  }

  async function testEmail() {
    setEmailError(''); setEmailSuccess('');
    try {
      const res = await api<{ message: string }>('/settings/email/test', { method: 'POST' });
      setEmailSuccess(res.message);
    } catch (e: unknown) { setEmailError(e instanceof Error ? e.message : 'Test failed'); }
  }

  // SLA functions
  async function seedSlaPolicies() {
    await api('/settings/sla-policies/seed-defaults', { method: 'POST' });
    const data = await api<SlaPolicy[]>('/settings/sla-policies');
    setSlaPolicies(data);
  }

  function openSlaEdit(policy?: SlaPolicy) {
    if (policy) {
      setEditingSlaId(policy.id);
      setSlaForm({
        name: policy.name, description: policy.description ?? '', isDefault: policy.isDefault,
        criticalResponseMinutes: String(policy.criticalResponseMinutes), criticalResolutionMinutes: String(policy.criticalResolutionMinutes),
        highResponseMinutes: String(policy.highResponseMinutes), highResolutionMinutes: String(policy.highResolutionMinutes),
        mediumResponseMinutes: String(policy.mediumResponseMinutes), mediumResolutionMinutes: String(policy.mediumResolutionMinutes),
        lowResponseMinutes: String(policy.lowResponseMinutes), lowResolutionMinutes: String(policy.lowResolutionMinutes),
      });
    } else {
      setEditingSlaId(null);
      setSlaForm({ name: '', description: '', isDefault: false, criticalResponseMinutes: '60', criticalResolutionMinutes: '240', highResponseMinutes: '240', highResolutionMinutes: '480', mediumResponseMinutes: '480', mediumResolutionMinutes: '1440', lowResponseMinutes: '1440', lowResolutionMinutes: '2880' });
    }
    setShowSlaEdit(true);
  }

  async function saveSlaPolicy(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: slaForm.name, description: slaForm.description || undefined, isDefault: slaForm.isDefault,
      criticalResponseMinutes: parseInt(slaForm.criticalResponseMinutes), criticalResolutionMinutes: parseInt(slaForm.criticalResolutionMinutes),
      highResponseMinutes: parseInt(slaForm.highResponseMinutes), highResolutionMinutes: parseInt(slaForm.highResolutionMinutes),
      mediumResponseMinutes: parseInt(slaForm.mediumResponseMinutes), mediumResolutionMinutes: parseInt(slaForm.mediumResolutionMinutes),
      lowResponseMinutes: parseInt(slaForm.lowResponseMinutes), lowResolutionMinutes: parseInt(slaForm.lowResolutionMinutes),
    };
    if (editingSlaId) {
      await api(`/settings/sla-policies/${editingSlaId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/settings/sla-policies', { method: 'POST', body: JSON.stringify(payload) });
    }
    setShowSlaEdit(false);
    const data = await api<SlaPolicy[]>('/settings/sla-policies');
    setSlaPolicies(data);
  }

  function fmtMins(m: number): string {
    if (m < 60) return `${m}m`;
    if (m % 60 === 0) return `${m / 60}h`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  return (
    <div className="max-w-4xl">
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="catalog">Product Catalog</TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent value="general">
          <div className="space-y-6 mt-4">
            {/* Profile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Profile</CardTitle>
                <CardDescription>Your personal account settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileMsg && (
                  <div className={`text-sm p-3 rounded-md ${profileMsg.startsWith('Failed') || profileMsg.startsWith('Current password') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'}`}>
                    {profileMsg}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input value={profileForm.displayName} onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input defaultValue={user?.email} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={user?.role ?? ''} disabled className="w-40" />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Change Password</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Input type="password" placeholder="Current password" value={profileForm.currentPassword} onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })} />
                    <Input type="password" placeholder="New password" value={profileForm.newPassword} onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })} />
                  </div>
                </div>
                <Button onClick={saveProfile} disabled={profileSaving}>{profileSaving ? 'Saving...' : 'Save Changes'}</Button>
              </CardContent>
            </Card>

            {/* Google Calendar Sync */}
            <Card className={calConnected ? 'border-green-300 dark:border-green-800' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google Calendar
                </CardTitle>
                <CardDescription>
                  {calConnected
                    ? 'Your dispatch schedule syncs to your Google Calendar'
                    : 'Connect to sync scheduled tickets to your Google Calendar'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {calConnecting ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Connecting...</span>
                  </div>
                ) : calConnected ? (
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="bg-green-600">Connected</Badge>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                      await api('/integrations/google-calendar/disconnect', { method: 'POST', body: JSON.stringify({}) });
                      setCalConnected(false);
                    }}>Disconnect</Button>
                  </div>
                ) : (
                  <Button onClick={async () => {
                    setCalConnecting(true);
                    try {
                      const res = await api<{ authUrl: string }>('/integrations/google-calendar/authorize');
                      window.location.href = res.authUrl;
                    } catch { setCalConnecting(false); }
                  }}>
                    Connect My Google Calendar
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Organization / Business Profile */}
            <BusinessProfileCard />

            {/* Timezone */}
            <Card>
              <CardHeader>
                <CardTitle>Timezone</CardTitle>
                <CardDescription>Default timezone for displaying dates and SLA calculations</CardDescription>
              </CardHeader>
              <CardContent>
                <select value={timezone} onChange={e => saveTimezone(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm max-w-xs">
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Anchorage">Alaska (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii (HT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </CardContent>
            </Card>

            {/* Numbering */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Hash className="h-5 w-5" />Numbering</CardTitle>
                <CardDescription>
                  Set the current counter for tickets, invoices, and quotes. The next created item will use counter + 1.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {seqSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">
                    {seqSuccess}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Ticket Counter</Label>
                    <Input
                      type="number"
                      min="0"
                      value={seqForm.ticket}
                      onChange={e => setSeqForm({ ...seqForm, ticket: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Next ticket: #{parseInt(seqForm.ticket || '0', 10) + 1}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Invoice Counter</Label>
                    <Input
                      type="number"
                      min="0"
                      value={seqForm.invoice}
                      onChange={e => setSeqForm({ ...seqForm, invoice: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Next invoice: #{parseInt(seqForm.invoice || '0', 10) + 1}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Quote Counter</Label>
                    <Input
                      type="number"
                      min="0"
                      value={seqForm.quote}
                      onChange={e => setSeqForm({ ...seqForm, quote: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Next quote: #{parseInt(seqForm.quote || '0', 10) + 1}</p>
                  </div>
                </div>
                <Button onClick={saveSequences} disabled={seqSaving}>
                  {seqSaving ? 'Saving...' : 'Update Counters'}
                </Button>
              </CardContent>
            </Card>

            {/* Billing Rates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Billing Rates</CardTitle>
                <CardDescription>Default internal cost and billable rates. Per-tech overrides apply when set.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {ratesSuccess && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">{ratesSuccess}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Default Internal Cost ($/hr)</Label>
                    <Input type="number" step="0.01" min="0"
                      value={(orgRates.internalCostCents / 100).toFixed(2)}
                      onChange={e => setOrgRates({ ...orgRates, internalCostCents: Math.round(parseFloat(e.target.value || '0') * 100) })} />
                    <p className="text-xs text-muted-foreground">What it costs you per hour of tech labor</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Billable Rate ($/hr)</Label>
                    <Input type="number" step="0.01" min="0"
                      value={(orgRates.billableRateCents / 100).toFixed(2)}
                      onChange={e => setOrgRates({ ...orgRates, billableRateCents: Math.round(parseFloat(e.target.value || '0') * 100) })} />
                    <p className="text-xs text-muted-foreground">What you charge customers per hour</p>
                  </div>
                </div>
                <Button onClick={saveOrgRates} disabled={ratesSaving}>{ratesSaving ? 'Saving...' : 'Save Default Rates'}</Button>

                <Separator />
                <div className="space-y-2">
                  <Label className="text-base">Per-Tech Rate Overrides</Label>
                  <p className="text-xs text-muted-foreground">Leave blank to use org defaults. Set per-tech when individual rates differ.</p>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 border-b">
                      <th className="text-left p-3 font-medium">Tech</th>
                      <th className="text-left p-3 font-medium">Role</th>
                      <th className="text-right p-3 font-medium">Internal Cost ($/hr)</th>
                      <th className="text-right p-3 font-medium">Billable Rate ($/hr)</th>
                    </tr></thead>
                    <tbody>
                      {techs.map(t => (
                        <tr key={t.id} className="border-b">
                          <td className="p-3">
                            <div className="font-medium">{t.displayName}</div>
                            <div className="text-xs text-muted-foreground">{t.email}</div>
                          </td>
                          <td className="p-3 capitalize">{t.role}</td>
                          <td className="p-2 text-right">
                            <Input type="number" step="0.01" min="0" className="w-28 text-right ml-auto"
                              placeholder={(orgRates.internalCostCents / 100).toFixed(2)}
                              value={t.internalCostCents !== null ? (t.internalCostCents / 100).toFixed(2) : ''}
                              onChange={e => {
                                const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null;
                                saveTechRate(t.id, val, t.billableRateCents);
                              }} />
                          </td>
                          <td className="p-2 text-right">
                            <Input type="number" step="0.01" min="0" className="w-28 text-right ml-auto"
                              placeholder={(orgRates.billableRateCents / 100).toFixed(2)}
                              value={t.billableRateCents !== null ? (t.billableRateCents / 100).toFixed(2) : ''}
                              onChange={e => {
                                const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null;
                                saveTechRate(t.id, t.internalCostCents, val);
                              }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* SLA Policies */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />SLA Policies</CardTitle>
                    <CardDescription>Define response and resolution times per priority level</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {slaPolicies.length === 0 && <Button variant="outline" size="sm" onClick={seedSlaPolicies}>Seed Defaults</Button>}
                    <Button size="sm" onClick={() => openSlaEdit()}>Add Policy</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Policy</th>
                    <th className="text-center p-3 font-medium">Critical</th>
                    <th className="text-center p-3 font-medium">High</th>
                    <th className="text-center p-3 font-medium">Medium</th>
                    <th className="text-center p-3 font-medium">Low</th>
                    <th className="w-20"></th>
                  </tr></thead>
                  <tbody>
                    {slaPolicies.map(p => (
                      <tr key={p.id} className="border-b hover:bg-muted/30">
                        <td className="p-3"><div className="font-medium">{p.name} {p.isDefault && <Badge variant="outline" className="ml-1 text-xs">Default</Badge>}</div>{p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}</td>
                        <td className="p-3 text-center text-xs"><div>{fmtMins(p.criticalResponseMinutes)} resp</div><div className="text-muted-foreground">{fmtMins(p.criticalResolutionMinutes)} res</div></td>
                        <td className="p-3 text-center text-xs"><div>{fmtMins(p.highResponseMinutes)} resp</div><div className="text-muted-foreground">{fmtMins(p.highResolutionMinutes)} res</div></td>
                        <td className="p-3 text-center text-xs"><div>{fmtMins(p.mediumResponseMinutes)} resp</div><div className="text-muted-foreground">{fmtMins(p.mediumResolutionMinutes)} res</div></td>
                        <td className="p-3 text-center text-xs"><div>{fmtMins(p.lowResponseMinutes)} resp</div><div className="text-muted-foreground">{fmtMins(p.lowResolutionMinutes)} res</div></td>
                        <td className="p-3"><Button variant="ghost" size="sm" onClick={() => openSlaEdit(p)}>Edit</Button></td>
                      </tr>
                    ))}
                    {slaPolicies.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No SLA policies. Click "Seed Defaults" to create Standard and Premium.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* SLA Edit Dialog */}
            <Dialog open={showSlaEdit} onOpenChange={setShowSlaEdit}>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingSlaId ? 'Edit SLA Policy' : 'Add SLA Policy'}</DialogTitle></DialogHeader>
                <form onSubmit={saveSlaPolicy} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Policy Name</Label><Input required value={slaForm.name} onChange={e => setSlaForm({...slaForm, name: e.target.value})} placeholder="Standard" /></div>
                    <div className="space-y-2"><Label>Description</Label><Input value={slaForm.description} onChange={e => setSlaForm({...slaForm, description: e.target.value})} /></div>
                  </div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={slaForm.isDefault} onChange={e => setSlaForm({...slaForm, isDefault: e.target.checked})} className="h-4 w-4" /><Label>Default policy (applied to customers without a specific SLA)</Label></div>
                  <Separator />
                  <div className="text-sm font-medium">Response / Resolution Times (minutes)</div>
                  {(['critical', 'high', 'medium', 'low'] as const).map(pri => (
                    <div key={pri} className="grid grid-cols-3 gap-3 items-center">
                      <Label className="capitalize">{pri}</Label>
                      <div className="space-y-1"><Input type="number" min="1" value={(slaForm as any)[`${pri}ResponseMinutes`]} onChange={e => setSlaForm({...slaForm, [`${pri}ResponseMinutes`]: e.target.value})} /><span className="text-xs text-muted-foreground">Response</span></div>
                      <div className="space-y-1"><Input type="number" min="1" value={(slaForm as any)[`${pri}ResolutionMinutes`]} onChange={e => setSlaForm({...slaForm, [`${pri}ResolutionMinutes`]: e.target.value})} /><span className="text-xs text-muted-foreground">Resolution</span></div>
                    </div>
                  ))}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowSlaEdit(false)}>Cancel</Button>
                    <Button type="submit">{editingSlaId ? 'Save' : 'Create'}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notifications</CardTitle>
                <CardDescription>Configure email and alert preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'ticketAssignment' as const, label: 'Ticket Assignments', desc: 'Email when a ticket is assigned to you' },
                  { key: 'slaWarning' as const, label: 'SLA Warnings', desc: 'Alert before SLA breach' },
                  { key: 'rmmAlerts' as const, label: 'RMM Alerts', desc: 'Agent offline and critical device alerts' },
                  { key: 'invoicePayments' as const, label: 'Invoice Payments', desc: 'Notify when a customer pays an invoice' },
                ].map((item, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="my-3" />}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.desc}</div>
                      </div>
                      <input type="checkbox" checked={notifs[item.key]} onChange={e => setNotifs({ ...notifs, [item.key]: e.target.checked })} className="h-4 w-4" />
                    </div>
                  </div>
                ))}
                <Button className="mt-2" onClick={saveNotifications}>Save Preferences</Button>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* EMAIL TAB */}
        <TabsContent value="email">
          <div className="space-y-6 mt-4 max-w-2xl">
            {emailSuccess && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{emailSuccess}</div>}
            {emailError && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{emailError}</div>}

            {/* Google Email Connection — Primary */}
            <Card className={gmailStatus.connected ? 'border-green-300 dark:border-green-800' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google Mailboxes
                </CardTitle>
                <CardDescription>
                  {gmailStatus.mailboxes.length > 0
                    ? `${gmailStatus.mailboxes.length} mailbox${gmailStatus.mailboxes.length > 1 ? 'es' : ''} connected — first mailbox is primary for sending`
                    : 'Connect your Google Workspace or Gmail mailboxes'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {gmailConnecting ? (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Redirecting to Google...</span>
                  </div>
                ) : (
                  <>
                    {gmailStatus.mailboxes.length > 0 && (
                      <div className="space-y-2">
                        {gmailStatus.mailboxes.map((mb, i) => (
                          <div key={mb.email} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge variant="default" className="bg-green-600">Connected</Badge>
                              <div>
                                <div className="text-sm font-medium">{mb.email}</div>
                                <div className="text-xs text-muted-foreground">
                                  {mb.displayName}{i === 0 ? ' — Primary (sends outbound email)' : ''}
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => disconnectGmail(mb.email)} className="text-destructive hover:text-destructive">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button onClick={connectGmail} variant={gmailStatus.mailboxes.length > 0 ? 'outline' : 'default'} className={gmailStatus.mailboxes.length > 0 ? '' : 'w-full'} size={gmailStatus.mailboxes.length > 0 ? 'sm' : 'lg'}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4 mr-1.5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      {gmailStatus.mailboxes.length > 0 ? 'Add Mailbox' : 'Connect Google Mailbox'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Google Setup Guide */}
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setShowGmailGuide(!showGmailGuide)}>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>How to Connect Google Email</span>
                  <Button variant="ghost" size="sm">{showGmailGuide ? 'Hide' : 'Show'}</Button>
                </CardTitle>
              </CardHeader>
              {showGmailGuide && (
                <CardContent className="space-y-3 text-sm">
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    <h4 className="font-semibold">Step 1: Enable Gmail API</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Go to <strong>Google Cloud Console</strong> → APIs & Services → Library</li>
                      <li>Search for <strong>Gmail API</strong> and click <strong>Enable</strong></li>
                    </ol>

                    <h4 className="font-semibold">Step 2: Configure OAuth Consent Screen</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Go to <strong>APIs & Services</strong> → OAuth consent screen</li>
                      <li>If already configured for SSO, just add the Gmail scopes below</li>
                      <li>Add scopes:
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li><code className="bg-background px-1 rounded">gmail.readonly</code> — Read emails</li>
                          <li><code className="bg-background px-1 rounded">gmail.send</code> — Send emails</li>
                          <li><code className="bg-background px-1 rounded">gmail.modify</code> — Mark as read</li>
                        </ul>
                      </li>
                    </ol>

                    <h4 className="font-semibold">Step 3: Add Redirect URI</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Go to <strong>APIs & Services</strong> → Credentials → your OAuth 2.0 Client</li>
                      <li>Under <strong>Authorized redirect URIs</strong>, add:</li>
                      <li><code className="bg-background px-1 rounded text-xs">{window.location.origin}/settings/email/callback</code></li>
                    </ol>

                    <h4 className="font-semibold">Step 4: Set Environment Variables</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Set <code className="bg-background px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="bg-background px-1 rounded">GOOGLE_CLIENT_SECRET</code> on the API server</li>
                      <li>Set <code className="bg-background px-1 rounded">GOOGLE_EMAIL_REDIRECT_URI</code> to <code className="bg-background px-1 rounded text-xs">{window.location.origin}/settings/email/callback</code></li>
                      <li>These are the same credentials used for Google SSO</li>
                    </ol>

                    <h4 className="font-semibold">Step 5: Connect in Rivertown PSA</h4>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Click <strong>Connect Google Mailbox</strong> above</li>
                      <li>Sign in with the mailbox account (e.g. support@yourcompany.com)</li>
                      <li>Grant the requested permissions</li>
                      <li>You'll be redirected back — email is now connected</li>
                    </ol>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Email-to-Ticket */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Email-to-Ticket</CardTitle>
                <CardDescription>Inbound emails from known contacts automatically create tickets. Replies to [Ticket #N] add comments.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button onClick={checkInbox} disabled={checkingInbox} variant="outline">
                    <Mail className="h-4 w-4 mr-1" />
                    {checkingInbox ? 'Checking...' : 'Check Inbox Now'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={loadEmailLog}>View Email Log</Button>
                </div>
                {inboxResult && (
                  <div className="text-sm bg-muted p-3 rounded-md">
                    Processed <strong>{inboxResult.processed}</strong> emails: <strong>{inboxResult.tickets}</strong> new tickets, <strong>{inboxResult.comments}</strong> comments added
                  </div>
                )}
                {emailLog.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50 border-b">
                        <th className="text-left p-2">Direction</th>
                        <th className="text-left p-2">From</th>
                        <th className="text-left p-2">Subject</th>
                        <th className="text-left p-2">Ticket</th>
                        <th className="text-left p-2">Date</th>
                      </tr></thead>
                      <tbody>
                        {emailLog.map(e => (
                          <tr key={e.id} className="border-b">
                            <td className="p-2"><Badge variant={e.direction === 'inbound' ? 'outline' : 'secondary'} className="text-xs">{e.direction}</Badge></td>
                            <td className="p-2">{e.fromAddress}</td>
                            <td className="p-2 max-w-[200px] truncate">{e.subject}</td>
                            <td className="p-2">{e.ticketId ? 'Linked' : '-'}</td>
                            <td className="p-2 text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Blocked Emails */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Blocked Senders</CardTitle>
                <CardDescription>Emails from these addresses or domains will be ignored. Use @domain.com to block an entire domain.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="email@example.com or @domain.com"
                    value={newBlockedEmail}
                    onChange={e => setNewBlockedEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addBlockedEmail()}
                    className="flex-1"
                  />
                  <Button onClick={addBlockedEmail} variant="outline" size="sm">Block</Button>
                </div>
                {blockedEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {blockedEmails.map(email => (
                      <Badge key={email} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1">
                        {email}
                        <button onClick={() => removeBlockedEmail(email)} className="ml-1 hover:text-destructive rounded-full p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {blockedEmails.length === 0 && (
                  <div className="text-sm text-muted-foreground">No blocked senders</div>
                )}
              </CardContent>
            </Card>

            {/* SMTP — only show if no Google mailboxes */}
            {!gmailStatus.connected && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />SMTP Configuration</CardTitle>
                <CardDescription>Manual SMTP configuration for email sending</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Enable SMTP</div>
                    <div className="text-xs text-muted-foreground">Use manual SMTP settings instead of Google email</div>
                  </div>
                  <input type="checkbox" className="h-4 w-4" checked={emailForm.isEnabled} onChange={e => setEmailForm({ ...emailForm, isEnabled: e.target.checked })} />
                </div>
                <Separator />

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label>SMTP Host</Label>
                    <Input value={emailForm.smtpHost} onChange={e => setEmailForm({ ...emailForm, smtpHost: e.target.value })} placeholder="smtp.office365.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input type="number" value={emailForm.smtpPort} onChange={e => setEmailForm({ ...emailForm, smtpPort: parseInt(e.target.value) || 587 })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={emailForm.smtpUser} onChange={e => setEmailForm({ ...emailForm, smtpUser: e.target.value })} placeholder="noreply@yourcompany.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={emailForm.smtpPassword} onChange={e => setEmailForm({ ...emailForm, smtpPassword: e.target.value })} placeholder="App password or API key" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>From Address</Label>
                    <Input type="email" value={emailForm.fromAddress} onChange={e => setEmailForm({ ...emailForm, fromAddress: e.target.value })} placeholder="support@yourcompany.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>From Name</Label>
                    <Input value={emailForm.fromName} onChange={e => setEmailForm({ ...emailForm, fromName: e.target.value })} placeholder="Rivertown Support" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="useTls" checked={emailForm.useTls} onChange={e => setEmailForm({ ...emailForm, useTls: e.target.checked })} />
                  <Label htmlFor="useTls">Use TLS/STARTTLS</Label>
                </div>

                <Separator />
                <div className="flex gap-2">
                  <Button onClick={saveEmail} disabled={emailSaving}>{emailSaving ? 'Saving...' : 'Save SMTP Settings'}</Button>
                  <Button variant="outline" onClick={testEmail} disabled={!emailForm.isEnabled}>
                    <Send className="h-4 w-4 mr-1" />Send Test Email
                  </Button>
                </div>
              </CardContent>
            </Card>}

          </div>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates">
          <div className="mt-4">
            <TemplatesSettingsPage />
          </div>
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing">
          <BillingSettingsTab />
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations">
          <div className="space-y-6 mt-4 max-w-2xl">
            {stripeSuccess && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{stripeSuccess}</div>}

            {/* Stripe */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Stripe
                </CardTitle>
                <CardDescription>Accept online payments for invoices. Payment links are automatically included in invoice emails.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><div className="text-sm font-medium">Enable Stripe</div><div className="text-xs text-muted-foreground">Add "Pay Now" buttons to invoice emails</div></div>
                  <input type="checkbox" className="h-4 w-4" checked={stripeForm.isEnabled} onChange={e => setStripeForm(f => ({ ...f, isEnabled: e.target.checked }))} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input type="password" value={stripeForm.secretKey} onChange={e => setStripeForm(f => ({ ...f, secretKey: e.target.value }))} placeholder="sk_live_... or sk_test_..." />
                  <p className="text-xs text-muted-foreground">Found in Stripe Dashboard → Developers → API keys</p>
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={stripeForm.webhookSecret} onChange={e => setStripeForm(f => ({ ...f, webhookSecret: e.target.value }))} placeholder="whsec_..." />
                  <p className="text-xs text-muted-foreground">Webhook URL: <code className="bg-muted px-1 rounded">{window.location.origin}/api/v1/webhooks/stripe</code></p>
                </div>
                <div className="space-y-2">
                  <Label>Publishable Key (optional)</Label>
                  <Input value={stripeForm.publishableKey} onChange={e => setStripeForm(f => ({ ...f, publishableKey: e.target.value }))} placeholder="pk_live_... or pk_test_..." />
                </div>
                <Button onClick={async () => {
                  setStripeSaving(true); setStripeSuccess('');
                  try { await api('/settings/stripe', { method: 'PUT', body: JSON.stringify(stripeForm) }); setStripeSuccess('Stripe settings saved'); } catch { /* */ }
                  finally { setStripeSaving(false); }
                }} disabled={stripeSaving}>{stripeSaving ? 'Saving...' : 'Save Stripe Settings'}</Button>
              </CardContent>
            </Card>

            {/* Pax8 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Pax8
                  {pax8Form.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
                </CardTitle>
                <CardDescription>Sync cloud subscriptions, licenses, and billing from Pax8 marketplace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={pax8Form.isEnabled} onChange={e => setPax8Form({ ...pax8Form, isEnabled: e.target.checked })} id="pax8Enabled" />
                  <Label htmlFor="pax8Enabled">Enable Pax8 Integration</Label>
                </div>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input value={pax8Form.clientId} onChange={e => setPax8Form({ ...pax8Form, clientId: e.target.value })} placeholder="Pax8 API Client ID" />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input type="password" value={pax8Form.clientSecret} onChange={e => setPax8Form({ ...pax8Form, clientSecret: e.target.value })} placeholder="Pax8 API Client Secret" />
                </div>
                <div className="space-y-2">
                  <Label>Auto-Sync Schedule</Label>
                  <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={pax8Form.syncFrequency} onChange={e => setPax8Form({ ...pax8Form, syncFrequency: e.target.value })}>
                    <option value="15min">Every 15 minutes</option>
                    <option value="30min">Every 30 minutes</option>
                    <option value="hourly">Every hour</option>
                    <option value="4hours">Every 4 hours</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">Get your API credentials from <strong>Pax8 Partner Portal → Developer → API Credentials</strong></p>
                {pax8Status.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">Last synced: {new Date(pax8Status.lastSyncAt).toLocaleString()}</p>
                )}
                {pax8Status.syncError && (
                  <p className="text-xs text-destructive">Sync error: {pax8Status.syncError}</p>
                )}
                {pax8Success && <p className="text-sm text-green-600">{pax8Success}</p>}
                {pax8TestResult && (
                  <p className={`text-sm ${pax8TestResult.success ? 'text-green-600' : 'text-destructive'}`}>{pax8TestResult.message}</p>
                )}
                <div className="flex gap-2">
                  <Button onClick={async () => {
                    setPax8Saving(true); setPax8Success('');
                    try { await api('/settings/pax8', { method: 'PUT', body: JSON.stringify(pax8Form) }); setPax8Success('Pax8 settings saved'); } catch { /* */ }
                    finally { setPax8Saving(false); }
                  }} disabled={pax8Saving}>{pax8Saving ? 'Saving...' : 'Save'}</Button>
                  <Button variant="outline" onClick={async () => {
                    setPax8Testing(true); setPax8TestResult(null);
                    try {
                      const res = await api<{ success: boolean; message: string }>('/settings/pax8/test', { method: 'POST' });
                      setPax8TestResult(res);
                    } catch (e: unknown) { setPax8TestResult({ success: false, message: e instanceof Error ? e.message : 'Test failed' }); }
                    finally { setPax8Testing(false); }
                  }} disabled={pax8Testing || !pax8Form.isEnabled}>{pax8Testing ? 'Testing...' : 'Test Connection'}</Button>
                  {pax8Form.isEnabled && (
                    <Button variant="outline" onClick={() => { window.history.pushState(null, '', '/pax8'); window.dispatchEvent(new PopStateEvent('popstate')); }}>
                      Manage Pax8
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* QuickBooks Online */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  QuickBooks Online
                </CardTitle>
                <CardDescription>Sync invoices, payments, and customers with QuickBooks Online.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" disabled>Connect QuickBooks (Coming Soon)</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECURITY TAB */}
        <TabsContent value="security">
          <div className="mt-4">
            <SecurityPage />
          </div>
        </TabsContent>

        {/* PRODUCT CATALOG TAB */}
        <TabsContent value="catalog">
          <div className="mt-4">
            <ProductCatalogPage />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== BILLING SETTINGS TAB (Tax Rates) =====
interface TaxRate {
  id: string; state: string; county: string | null; combinedRate: string;
  stateRate: string | null; countyRate: string | null;
  appliesToProducts: boolean; appliesToServices: boolean; isActive: boolean;
}

function BillingSettingsTab() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ state: '', county: '', combinedRate: '', stateRate: '', countyRate: '', appliesToProducts: true, appliesToServices: false });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadRates(); }, []);

  async function loadRates() {
    const data = await api<TaxRate[]>('/settings/tax-rates');
    setRates(data);
  }

  const filtered = rates.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.state.toLowerCase().includes(s) || (r.county?.toLowerCase().includes(s));
  });

  function openAdd() {
    setEditId(null);
    setForm({ state: '', county: '', combinedRate: '', stateRate: '', countyRate: '', appliesToProducts: true, appliesToServices: false });
    setShowAdd(true);
  }

  function openEdit(r: TaxRate) {
    setEditId(r.id);
    setForm({
      state: r.state, county: r.county ?? '', combinedRate: r.combinedRate,
      stateRate: r.stateRate ?? '', countyRate: r.countyRate ?? '',
      appliesToProducts: r.appliesToProducts, appliesToServices: r.appliesToServices,
    });
    setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      if (editId) {
        await api(`/settings/tax-rates/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/tax-rates', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowAdd(false); loadRates();
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tax rate?')) return;
    await api(`/settings/tax-rates/${id}`, { method: 'DELETE' });
    loadRates();
  }

  async function seedRates() {
    setSeeding(true);
    try {
      const res = await api<{ created: number; total: number }>('/settings/tax-rates/seed', { method: 'POST', body: JSON.stringify({}) });
      setMessage(`Seeded ${res.created} of ${res.total} rates`);
      loadRates();
    } catch { setMessage('Seed failed'); }
    finally { setSeeding(false); }
  }

  // Group by state for display
  const stateGroups = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const arr = stateGroups.get(r.state) || [];
    arr.push(r);
    stateGroups.set(r.state, arr);
  }

  return (
    <div className="space-y-6 mt-4">
      {message && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">{message}</div>}

      <BillingEmailCard />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Tax Rates</CardTitle>
              <CardDescription>Manage sales tax rates by state and county. Rates auto-apply to invoices based on customer billing address.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={seedRates} disabled={seeding}>{seeding ? 'Seeding...' : 'Seed SC/NC Rates'}</Button>
              <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rate</Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by state or county..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No tax rates found. Click "Seed SC/NC Rates" to pre-populate, or add manually.</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">State</th>
                    <th className="text-left p-3 font-medium">County</th>
                    <th className="text-right p-3 font-medium">Combined</th>
                    <th className="text-right p-3 font-medium">State</th>
                    <th className="text-right p-3 font-medium">Local</th>
                    <th className="text-center p-3 font-medium">Products</th>
                    <th className="text-center p-3 font-medium">Services</th>
                    <th className="text-right p-3 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.state}</td>
                      <td className="p-3">{r.county || <span className="text-muted-foreground italic">State default</span>}</td>
                      <td className="p-3 text-right font-mono">{parseFloat(r.combinedRate).toFixed(2)}%</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{r.stateRate ? parseFloat(r.stateRate).toFixed(2) + '%' : '-'}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{r.countyRate ? parseFloat(r.countyRate).toFixed(2) + '%' : '-'}</td>
                      <td className="p-3 text-center">{r.appliesToProducts ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</td>
                      <td className="p-3 text-center">{r.appliesToServices ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-3 border-t text-xs text-muted-foreground">{filtered.length} rates{search ? ` matching "${search}"` : ''} ({rates.length} total)</div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Tax Rate' : 'Add Tax Rate'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>State Code</Label>
                <Input required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} placeholder="SC" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label>County (optional)</Label>
                <Input value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} placeholder="Horry" />
                <p className="text-xs text-muted-foreground">Leave blank for state-level default</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Combined Rate %</Label>
                <Input required type="number" step="0.01" value={form.combinedRate} onChange={e => setForm(f => ({ ...f, combinedRate: e.target.value }))} placeholder="8.00" />
              </div>
              <div className="space-y-2">
                <Label>State Rate %</Label>
                <Input type="number" step="0.01" value={form.stateRate} onChange={e => setForm(f => ({ ...f, stateRate: e.target.value }))} placeholder="6.00" />
              </div>
              <div className="space-y-2">
                <Label>Local Rate %</Label>
                <Input type="number" step="0.01" value={form.countyRate} onChange={e => setForm(f => ({ ...f, countyRate: e.target.value }))} placeholder="2.00" />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="taxProducts" checked={form.appliesToProducts} onChange={e => setForm(f => ({ ...f, appliesToProducts: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="taxProducts">Applies to Products</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="taxServices" checked={form.appliesToServices} onChange={e => setForm(f => ({ ...f, appliesToServices: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="taxServices">Applies to Services</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Rate'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== BILLING EMAIL CARD (Mailjet) =====

function BillingEmailCard() {
  const [config, setConfig] = useState({
    isEnabled: false, smtpHost: 'in-v3.mailjet.com', smtpPort: 587,
    apiKey: '', secretKey: '', fromAddress: '', fromName: '', replyTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/billing-email').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/billing-email', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('Billing email settings saved');
      const updated = await api<typeof config>('/settings/billing-email');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/billing-email/test', {
        method: 'POST', body: JSON.stringify({ email: testEmail || undefined }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Billing Email (Mailjet)</CardTitle>
        <CardDescription>Configure the email used for invoices, payment receipts, and quotes. Customer replies will go to the Reply-To address.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={config.isEnabled} onChange={e => setConfig(c => ({ ...c, isEnabled: e.target.checked }))} className="rounded" />
              Enable billing email
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>From Address</Label>
              <Input value={config.fromAddress} onChange={e => setConfig(c => ({ ...c, fromAddress: e.target.value }))} placeholder="invoices@rivertowntechnology.com" />
            </div>
            <div>
              <Label>From Name</Label>
              <Input value={config.fromName} onChange={e => setConfig(c => ({ ...c, fromName: e.target.value }))} placeholder="Rivertown Technology" />
            </div>
          </div>

          <div>
            <Label>Reply-To Address</Label>
            <Input value={config.replyTo} onChange={e => setConfig(c => ({ ...c, replyTo: e.target.value }))} placeholder="invoices@rivertowntechnology.com (shared mailbox)" />
            <p className="text-xs text-muted-foreground mt-1">Customer replies will go to this address</p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mailjet API Key</Label>
              <Input value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Mailjet API Key" />
            </div>
            <div>
              <Label>Mailjet Secret Key</Label>
              <Input type="password" value={config.secretKey} onChange={e => setConfig(c => ({ ...c, secretKey: e.target.value }))} placeholder="Mailjet Secret Key" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>SMTP Host</Label>
              <Input value={config.smtpHost} onChange={e => setConfig(c => ({ ...c, smtpHost: e.target.value }))} placeholder="in-v3.mailjet.com" />
            </div>
            <div>
              <Label>SMTP Port</Label>
              <Input type="number" value={config.smtpPort} onChange={e => setConfig(c => ({ ...c, smtpPort: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Billing Email Settings'}</Button>
            <div className="flex items-center gap-2">
              <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="w-48" />
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                <Send className="h-4 w-4 mr-1" />{testing ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
