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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { User, Building, Bell, Hash, Mail, Send, CheckCircle, DollarSign, Shield, ShieldAlert, X, Package, Plus, Pencil, Trash2, Search, Sparkles, MessageSquare, Monitor, Smile, Server, HardDrive, FileText } from 'lucide-react';
import { BusinessProfileCard } from '@/components/business-profile-card';
import { SecurityPage } from './security';
import { ProductCatalogPage } from './product-catalog';
import { TemplatesSettingsPage } from './templates-settings';
import { NumberStepper } from '@/components/ui/number-stepper';

interface EmailConfig {
  isEnabled: boolean; smtpHost: string; smtpPort: number; smtpUser: string;
  smtpPassword: string; fromAddress: string; fromName: string; useTls: boolean; provider: string;
}

const defaultEmail: EmailConfig = {
  isEnabled: false, smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '',
  fromAddress: '', fromName: '', useTls: true, provider: 'smtp',
};

export function SettingsPage({ initialTab, hideTabsList }: { initialTab?: string; hideTabsList?: boolean } = {}) {
  const { user } = useAuth();
  const { mode, color, setMode, setColor } = useTheme();
  // Parse hash: "#topTab" or "#topTab/subTab" or "#topTab/subTab/subSubTab"
  const hashRaw = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  const hashParts = hashRaw.split('/');
  const validTabs = ['account', 'company', 'operations', 'tickets', 'catalog', 'integrations', 'audit'];
  const legacyMap: Record<string, string> = {
    account: 'company', // My Account moved to /account route; settings defaults to Company
    general: 'company',
    templates: 'operations/templates',
    email: 'integrations/email',
    billing: 'integrations/accounting/tax-rates',
    ai: 'integrations/ai',
    security: 'company', // Security moved to /account page
  };
  const rawTopTab = initialTab || hashParts[0] || 'company';
  const legacyRedirect = !validTabs.includes(rawTopTab) ? legacyMap[rawTopTab] : undefined;
  const resolvedHash = legacyRedirect || (validTabs.includes(rawTopTab) ? hashRaw : 'company');
  const [resolvedTop, resolvedSub, resolvedSubSub] = resolvedHash.split('/');
  const [tab, setTab] = useState(resolvedTop);
  const [integrationsSubTab, setIntegrationsSubTab] = useState(
    resolvedTop === 'integrations' ? (resolvedSub || 'email') : 'email',
  );
  const [accountingSubTab, setAccountingSubTab] = useState(
    resolvedTop === 'integrations' && resolvedSub === 'accounting' ? (resolvedSubSub || 'quickbooks') : 'quickbooks',
  );
  const [rmmSubTab, setRmmSubTab] = useState(
    resolvedTop === 'integrations' && resolvedSub === 'rmm' ? (resolvedSubSub || 'ninja') : 'ninja',
  );

  function writeHash(top: string, sub?: string, subSub?: string) {
    let h = top;
    if (sub) h += `/${sub}`;
    if (subSub) h += `/${subSub}`;
    window.history.replaceState(null, '', `/settings#${h}`);
  }
  function changeTab(t: string) {
    setTab(t);
    if (t === 'integrations') {
      const sub = integrationsSubTab;
      writeHash(t, sub, sub === 'accounting' ? accountingSubTab : sub === 'rmm' ? rmmSubTab : undefined);
    } else {
      writeHash(t);
    }
  }
  function changeIntegrationsSub(s: string) {
    setIntegrationsSubTab(s);
    writeHash('integrations', s, s === 'accounting' ? accountingSubTab : s === 'rmm' ? rmmSubTab : undefined);
  }
  function changeAccountingSub(s: string) {
    setAccountingSubTab(s);
    writeHash('integrations', 'accounting', s);
  }
  function changeRmmSub(s: string) {
    setRmmSubTab(s);
    writeHash('integrations', 'rmm', s);
  }
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
  const [slaTimeUnit, setSlaTimeUnit] = useState<'minutes' | 'hours'>('minutes');
  const [slaForm, setSlaForm] = useState({
    name: '', description: '', isDefault: false,
    criticalResponseMinutes: '60', criticalResolutionMinutes: '240',
    highResponseMinutes: '240', highResolutionMinutes: '480',
    mediumResponseMinutes: '480', mediumResolutionMinutes: '1440',
    lowResponseMinutes: '1440', lowResolutionMinutes: '2880',
    businessHoursEnabled: false,
    businessHoursStart: '09:00',
    businessHoursEnd: '17:00',
    businessDays: '1,2,3,4,5',
    holidays: [] as string[],
  });

  // Profile
  const [profileForm, setProfileForm] = useState({ displayName: '', currentPassword: '', newPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Notifications
  const [notifs, setNotifs] = useState({ ticketAssignment: true, slaWarning: true, rmmAlerts: true, invoicePayments: true });

  // Ticket Automation
  const [ticketAuto, setTicketAuto] = useState({
    ticketAutoCloseResolvedEnabled: false,
    ticketAutoCloseResolvedDays: 3,
    ticketAutoCloseWaitingEnabled: false,
    ticketAutoCloseWaitingDays: 7,
    ticketAutoReopenOnReply: true,
    ticketSlaPauseOnWaiting: true,
  });
  const [ticketAutoLoaded, setTicketAutoLoaded] = useState(false);
  const [ticketAutoSaving, setTicketAutoSaving] = useState(false);
  const [ticketAutoSuccess, setTicketAutoSuccess] = useState('');

  useEffect(() => {
    if (ticketAutoLoaded) return;
    api<typeof ticketAuto>('/settings/ticket-automation')
      .then(data => { setTicketAuto(data); setTicketAutoLoaded(true); })
      .catch(() => setTicketAutoLoaded(true));
  }, [ticketAutoLoaded]);

  async function saveTicketAutomation() {
    setTicketAutoSaving(true);
    setTicketAutoSuccess('');
    try {
      await api('/settings/ticket-automation', { method: 'PUT', body: JSON.stringify(ticketAuto) });
      setTicketAutoSuccess('Settings saved');
      setTimeout(() => setTicketAutoSuccess(''), 3000);
    } catch { /* */ }
    finally { setTicketAutoSaving(false); }
  }

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
        businessHoursEnabled: (policy as any).businessHoursEnabled ?? false,
        businessHoursStart: (policy as any).businessHoursStart ?? '09:00',
        businessHoursEnd: (policy as any).businessHoursEnd ?? '17:00',
        businessDays: (policy as any).businessDays ?? '1,2,3,4,5',
        holidays: (policy as any).holidays ?? [],
      });
    } else {
      setEditingSlaId(null);
      setSlaForm({ name: '', description: '', isDefault: false, criticalResponseMinutes: '60', criticalResolutionMinutes: '240', highResponseMinutes: '240', highResolutionMinutes: '480', mediumResponseMinutes: '480', mediumResolutionMinutes: '1440', lowResponseMinutes: '1440', lowResolutionMinutes: '2880', businessHoursEnabled: false, businessHoursStart: '09:00', businessHoursEnd: '17:00', businessDays: '1,2,3,4,5', holidays: [] });
    }
    setShowSlaEdit(true);
  }

  async function saveSlaPolicy(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: slaForm.name, description: slaForm.description || undefined, isDefault: slaForm.isDefault,
      criticalResponseMinutes: parseInt(slaForm.criticalResponseMinutes), criticalResolutionMinutes: parseInt(slaForm.criticalResolutionMinutes),
      highResponseMinutes: parseInt(slaForm.highResponseMinutes), highResolutionMinutes: parseInt(slaForm.highResolutionMinutes),
      mediumResponseMinutes: parseInt(slaForm.mediumResponseMinutes), mediumResolutionMinutes: parseInt(slaForm.mediumResolutionMinutes),
      lowResponseMinutes: parseInt(slaForm.lowResponseMinutes), lowResolutionMinutes: parseInt(slaForm.lowResolutionMinutes),
      businessHoursEnabled: slaForm.businessHoursEnabled,
      businessHoursStart: slaForm.businessHoursStart,
      businessHoursEnd: slaForm.businessHoursEnd,
      businessDays: slaForm.businessDays,
      holidays: slaForm.holidays,
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

  // Email integrations JSX — reused inside Integrations > Email sub-tab (was previously the top-level Email tab)
  const emailIntegrationsJsx = (
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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={emailForm.isEnabled}
                    onClick={() => setEmailForm({ ...emailForm, isEnabled: !emailForm.isEnabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${emailForm.isEnabled ? 'bg-green-500' : 'bg-input'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${emailForm.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={emailForm.useTls}
                    onClick={() => setEmailForm({ ...emailForm, useTls: !emailForm.useTls })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${emailForm.useTls ? 'bg-green-500' : 'bg-input'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${emailForm.useTls ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <Label>Use TLS/STARTTLS</Label>
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
  );

  return (
    <div className="max-w-4xl">
      <Tabs value={tab} onValueChange={changeTab}>
        {!hideTabsList && (
          <TabsList>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="catalog">Product Catalog</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
        )}

        {/* MY ACCOUNT TAB */}
        <TabsContent value="account">
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

            {/* Notifications (moved here from General) */}
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
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifs[item.key]}
                        onClick={() => setNotifs({ ...notifs, [item.key]: !notifs[item.key] })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${notifs[item.key] ? 'bg-green-500' : 'bg-input'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${notifs[item.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                ))}
                <Button className="mt-2" onClick={saveNotifications}>Save Preferences</Button>
              </CardContent>
            </Card>

            {/* Security (2FA) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Security</CardTitle>
                <CardDescription>Two-factor authentication and sign-in security</CardDescription>
              </CardHeader>
              <CardContent>
                <SecurityPage />
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* COMPANY TAB */}
        <TabsContent value="company">
          <div className="space-y-6 mt-4">
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

          </div>
        </TabsContent>

        {/* OPERATIONS TAB */}
        <TabsContent value="operations">
          <Tabs defaultValue="sla" className="mt-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="sla">SLA</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="report-template">Report Template</TabsTrigger>
            </TabsList>
            <TabsContent value="templates">
              <div className="mt-4">
                <TemplatesSettingsPage />
              </div>
            </TabsContent>
            <TabsContent value="sla">
          <div className="space-y-6 mt-4">

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
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingSlaId ? 'Edit SLA Policy' : 'Add SLA Policy'}</DialogTitle>
                  <p className="text-sm text-muted-foreground">Define response and resolution targets for each priority level</p>
                </DialogHeader>
                <form onSubmit={saveSlaPolicy} className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Policy Name</Label><Input required value={slaForm.name} onChange={e => setSlaForm({...slaForm, name: e.target.value})} placeholder="Standard" /></div>
                    <div className="space-y-2"><Label>Description</Label><Input value={slaForm.description} onChange={e => setSlaForm({...slaForm, description: e.target.value})} placeholder="Default SLA for all customers" /></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <button type="button" role="switch" aria-checked={slaForm.isDefault}
                        onClick={() => setSlaForm({...slaForm, isDefault: !slaForm.isDefault})}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${slaForm.isDefault ? 'bg-green-500' : 'bg-input'}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${slaForm.isDefault ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <span className="text-sm">Default policy for new customers</span>
                    </label>
                    {/* Unit toggle */}
                    <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
                      <button type="button"
                        onClick={() => setSlaTimeUnit('minutes')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-150 ${slaTimeUnit === 'minutes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        Minutes
                      </button>
                      <button type="button"
                        onClick={() => setSlaTimeUnit('hours')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-150 ${slaTimeUnit === 'hours' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        Hours
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border overflow-hidden">
                    {/* Column headers */}
                    <div className="grid grid-cols-[100px_1fr_1fr] bg-muted/50 border-b">
                      <div className="p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</div>
                      <div className="p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Response ({slaTimeUnit === 'hours' ? 'hrs' : 'min'})</div>
                      <div className="p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Resolution ({slaTimeUnit === 'hours' ? 'hrs' : 'min'})</div>
                    </div>
                    {/* Priority rows */}
                    {(['critical', 'high', 'medium', 'low'] as const).map((pri, i) => {
                      const respKey = `${pri}ResponseMinutes` as keyof typeof slaForm;
                      const resKey = `${pri}ResolutionMinutes` as keyof typeof slaForm;
                      const respMins = parseInt(slaForm[respKey] as string) || 0;
                      const resMins = parseInt(slaForm[resKey] as string) || 0;

                      const displayResp = slaTimeUnit === 'hours' ? parseFloat((respMins / 60).toFixed(1)) : respMins;
                      const displayRes = slaTimeUnit === 'hours' ? parseFloat((resMins / 60).toFixed(1)) : resMins;
                      const stepVal = slaTimeUnit === 'hours' ? 0.5 : (respMins >= 480 ? 30 : respMins >= 60 ? 15 : 5);

                      const setResp = (v: number) => {
                        const mins = slaTimeUnit === 'hours' ? Math.round(v * 60) : v;
                        setSlaForm(f => ({ ...f, [respKey]: String(Math.max(1, mins)) }));
                      };
                      const setRes = (v: number) => {
                        const mins = slaTimeUnit === 'hours' ? Math.round(v * 60) : v;
                        setSlaForm(f => ({ ...f, [resKey]: String(Math.max(1, mins)) }));
                      };

                      const priColors: Record<string, string> = {
                        critical: 'text-red-500 dark:text-red-400',
                        high: 'text-orange-500 dark:text-orange-400',
                        medium: 'text-blue-500 dark:text-blue-400',
                        low: 'text-gray-500 dark:text-gray-400',
                      };
                      const priDots: Record<string, string> = {
                        critical: 'bg-red-500',
                        high: 'bg-orange-500',
                        medium: 'bg-blue-500',
                        low: 'bg-gray-400',
                      };

                      return (
                        <div key={pri} className={`grid grid-cols-[100px_1fr_1fr] items-center ${i < 3 ? 'border-b' : ''}`}>
                          <div className="p-3 flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${priDots[pri]}`} />
                            <span className={`text-sm font-medium capitalize ${priColors[pri]}`}>{pri}</span>
                          </div>
                          <div className="p-2 flex justify-center">
                            <NumberStepper
                              value={displayResp}
                              onChange={setResp}
                              min={slaTimeUnit === 'hours' ? 0.5 : 1}
                              max={slaTimeUnit === 'hours' ? 168 : 10080}
                              step={stepVal}
                            />
                          </div>
                          <div className="p-2 flex justify-center">
                            <NumberStepper
                              value={displayRes}
                              onChange={setRes}
                              min={slaTimeUnit === 'hours' ? 0.5 : 1}
                              max={slaTimeUnit === 'hours' ? 168 : 10080}
                              step={stepVal}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Values are stored in minutes internally. Switching between units converts the display only.</p>

                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Business Hours Only</div>
                        <div className="text-xs text-muted-foreground">SLA timers only count during business hours</div>
                      </div>
                      <button type="button" role="switch" aria-checked={slaForm.businessHoursEnabled}
                        onClick={() => setSlaForm({...slaForm, businessHoursEnabled: !slaForm.businessHoursEnabled})}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${slaForm.businessHoursEnabled ? 'bg-green-500' : 'bg-input'}`}>
                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 ${slaForm.businessHoursEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                    {slaForm.businessHoursEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Start Time</Label>
                            <Input type="time" value={slaForm.businessHoursStart} onChange={e => setSlaForm({...slaForm, businessHoursStart: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">End Time</Label>
                            <Input type="time" value={slaForm.businessHoursEnd} onChange={e => setSlaForm({...slaForm, businessHoursEnd: e.target.value})} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Business Days</Label>
                          <div className="flex gap-1.5">
                            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => {
                              const days = slaForm.businessDays.split(',').map(Number);
                              const active = days.includes(i);
                              return (
                                <button key={day} type="button"
                                  onClick={() => {
                                    const next = active ? days.filter(d => d !== i) : [...days, i].sort();
                                    setSlaForm({...slaForm, businessDays: next.join(',')});
                                  }}
                                  className={`w-9 h-8 rounded text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Holidays (one per line, YYYY-MM-DD)</Label>
                          <textarea rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                            value={(slaForm.holidays || []).join('\n')}
                            onChange={e => setSlaForm({...slaForm, holidays: e.target.value.split('\n').filter(Boolean)})}
                            placeholder={"2026-12-25\n2027-01-01"} />
                        </div>
                      </>
                    )}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowSlaEdit(false)}>Cancel</Button>
                    <Button type="submit">{editingSlaId ? 'Save Changes' : 'Create Policy'}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>


          </div>
            </TabsContent>

            <TabsContent value="report-template">
              <div className="mt-4 text-sm text-muted-foreground">Report template settings coming soon.</div>
            </TabsContent>

          </Tabs>
        </TabsContent>

        {/* TICKETS TAB */}
        <TabsContent value="tickets">
          <Tabs defaultValue="automation" className="mt-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="automation">Automation</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="canned-responses">Canned Responses</TabsTrigger>
              <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
              <TabsTrigger value="queues">Queues</TabsTrigger>
              <TabsTrigger value="recurring">Recurring</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
              <TabsTrigger value="ticket-templates">Templates</TabsTrigger>
              <TabsTrigger value="workflows">Workflows</TabsTrigger>
            </TabsList>

            {/* AUTOMATION SUB-TAB */}
            <TabsContent value="automation">
              <div className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Ticket Automation</CardTitle>
                    <p className="text-sm text-muted-foreground">Configure how tickets move through their lifecycle automatically</p>
                  </CardHeader>
                  <CardContent className="space-y-0 divide-y">
                    {/* Auto-close resolved */}
                    <div className="py-5 first:pt-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Auto-close resolved tickets</div>
                          <div className="text-sm text-muted-foreground">Automatically close tickets after they've been resolved for a set number of days</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ticketAuto.ticketAutoCloseResolvedEnabled}
                          onClick={() => setTicketAuto({ ...ticketAuto, ticketAutoCloseResolvedEnabled: !ticketAuto.ticketAutoCloseResolvedEnabled })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${ticketAuto.ticketAutoCloseResolvedEnabled ? 'bg-green-500' : 'bg-input'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${ticketAuto.ticketAutoCloseResolvedEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      {ticketAuto.ticketAutoCloseResolvedEnabled && (
                        <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <span className="text-sm text-muted-foreground">Close after</span>
                          <NumberStepper
                            value={ticketAuto.ticketAutoCloseResolvedDays}
                            onChange={v => setTicketAuto({ ...ticketAuto, ticketAutoCloseResolvedDays: v })}
                            min={1} max={90}
                          />
                          <span className="text-sm text-muted-foreground">days in resolved status</span>
                        </div>
                      )}
                    </div>

                    {/* Auto-close waiting on customer */}
                    <div className="py-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Auto-close waiting on customer</div>
                          <div className="text-sm text-muted-foreground">Close tickets stuck in "Waiting on Customer" with no reply after a set period</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ticketAuto.ticketAutoCloseWaitingEnabled}
                          onClick={() => setTicketAuto({ ...ticketAuto, ticketAutoCloseWaitingEnabled: !ticketAuto.ticketAutoCloseWaitingEnabled })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${ticketAuto.ticketAutoCloseWaitingEnabled ? 'bg-green-500' : 'bg-input'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${ticketAuto.ticketAutoCloseWaitingEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      {ticketAuto.ticketAutoCloseWaitingEnabled && (
                        <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <span className="text-sm text-muted-foreground">Close after</span>
                          <NumberStepper
                            value={ticketAuto.ticketAutoCloseWaitingDays}
                            onChange={v => setTicketAuto({ ...ticketAuto, ticketAutoCloseWaitingDays: v })}
                            min={1} max={90}
                          />
                          <span className="text-sm text-muted-foreground">days of no activity</span>
                        </div>
                      )}
                    </div>

                    {/* Auto-reopen on reply */}
                    <div className="py-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Auto-reopen on customer reply</div>
                          <div className="text-sm text-muted-foreground">
                            Reopen resolved tickets when a customer sends an email reply.
                            <span className="block mt-1 text-xs italic text-muted-foreground/70">Replies to closed tickets always create a new ticket instead.</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ticketAuto.ticketAutoReopenOnReply}
                          onClick={() => setTicketAuto({ ...ticketAuto, ticketAutoReopenOnReply: !ticketAuto.ticketAutoReopenOnReply })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${ticketAuto.ticketAutoReopenOnReply ? 'bg-green-500' : 'bg-input'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${ticketAuto.ticketAutoReopenOnReply ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>

                    {/* SLA pause on waiting */}
                    <div className="py-5 last:pb-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Pause SLA on waiting on customer</div>
                          <div className="text-sm text-muted-foreground">Stop the SLA resolution clock while a ticket is in "Waiting on Customer" status and resume when it leaves</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ticketAuto.ticketSlaPauseOnWaiting}
                          onClick={() => setTicketAuto({ ...ticketAuto, ticketSlaPauseOnWaiting: !ticketAuto.ticketSlaPauseOnWaiting })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${ticketAuto.ticketSlaPauseOnWaiting ? 'bg-green-500' : 'bg-input'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${ticketAuto.ticketSlaPauseOnWaiting ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                  <div className="px-6 py-4 border-t bg-muted/30 rounded-b-lg flex items-center gap-3">
                    <Button onClick={saveTicketAutomation} disabled={ticketAutoSaving}>
                      {ticketAutoSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                    {ticketAutoSuccess && (
                      <span className="text-sm text-green-600 animate-fade-in">{ticketAutoSuccess}</span>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* CATEGORIES SUB-TAB */}
            <TabsContent value="categories">
              <CategoriesTab />
            </TabsContent>

            {/* CANNED RESPONSES SUB-TAB */}
            <TabsContent value="canned-responses">
              <CannedResponsesTab />
            </TabsContent>

            {/* CUSTOM FIELDS SUB-TAB */}
            <TabsContent value="custom-fields">
              <CustomFieldsTab />
            </TabsContent>

            {/* QUEUES SUB-TAB */}
            <TabsContent value="queues">
              <QueuesTab />
            </TabsContent>

            {/* RECURRING SUB-TAB */}
            <TabsContent value="recurring">
              <RecurringTicketsTab />
            </TabsContent>

            {/* TAGS SUB-TAB */}
            <TabsContent value="tags">
              <TagsTab />
            </TabsContent>

            {/* TICKET TEMPLATES SUB-TAB */}
            <TabsContent value="ticket-templates">
              <TicketTemplatesTab />
            </TabsContent>

            {/* WORKFLOWS SUB-TAB */}
            <TabsContent value="workflows">
              <WorkflowRulesTab />
            </TabsContent>

          </Tabs>
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations">
          <Tabs value={integrationsSubTab} onValueChange={changeIntegrationsSub} className="mt-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="accounting">Accounting</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="billing-email">Billing Email</TabsTrigger>
              <TabsTrigger value="csat">CSAT</TabsTrigger>
              <TabsTrigger value="email">Email & Inbox</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="rmm">RMM</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="storage">Storage</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>

            {/* CSAT SUB-TAB (CrewHu) */}
            <TabsContent value="csat">
              <div className="space-y-6 mt-4 max-w-2xl">
                <CrewHuCard />
              </div>
            </TabsContent>

            {/* EMAIL & INBOX SUB-TAB */}
            <TabsContent value="email">
              {emailIntegrationsJsx}
            </TabsContent>

            {/* BILLING EMAIL SUB-TAB */}
            <TabsContent value="billing-email">
              <div className="space-y-6 mt-4 max-w-2xl">
                <BillingEmailCard />
              </div>
            </TabsContent>

            {/* AI SUB-TAB */}
            <TabsContent value="ai">
              <AISettingsTab />
            </TabsContent>

            {/* SMS SUB-TAB (moved from Communication) */}
            <TabsContent value="sms">
              <div className="space-y-6 mt-4 max-w-2xl">
                <TwilioCard />
              </div>
            </TabsContent>

            {/* STORAGE SUB-TAB (Cloudflare R2) */}
            <TabsContent value="storage">
              <div className="space-y-6 mt-4 max-w-2xl">
                <StorageCard />
              </div>
            </TabsContent>

            {/* PAYMENTS SUB-TAB */}
            <TabsContent value="payments">
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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={stripeForm.isEnabled}
                    onClick={() => setStripeForm(f => ({ ...f, isEnabled: !f.isEnabled }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${stripeForm.isEnabled ? 'bg-green-500' : 'bg-input'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${stripeForm.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
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

            {/* ConnectBooster */}
            <ConnectBoosterCard />

            {/* QBO Payments */}
            <QBOPaymentsCard />
          </div>
        </TabsContent>

        {/* VENDORS SUB-TAB */}
        <TabsContent value="vendors">
          <div className="space-y-6 mt-4 max-w-2xl">

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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pax8Form.isEnabled}
                    onClick={() => setPax8Form({ ...pax8Form, isEnabled: !pax8Form.isEnabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${pax8Form.isEnabled ? 'bg-green-500' : 'bg-input'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${pax8Form.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <Label>Enable Pax8 Integration</Label>
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

          </div>
        </TabsContent>

        {/* ACCOUNTING SUB-TAB */}
        <TabsContent value="accounting">
          <Tabs value={accountingSubTab} onValueChange={changeAccountingSub} className="mt-4">
            <TabsList>
              <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
              <TabsTrigger value="tax-rates">Tax Rates</TabsTrigger>
              <TabsTrigger value="billing-rates">Billing Rates</TabsTrigger>
            </TabsList>
            <TabsContent value="quickbooks">
              <div className="space-y-6 mt-4 max-w-2xl">
                <QuickBooksCard />
              </div>
            </TabsContent>
            <TabsContent value="tax-rates">
              <div className="mt-4">
                <BillingSettingsTab />
              </div>
            </TabsContent>
            <TabsContent value="billing-rates">
              <div className="mt-4">
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
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* RMM SUB-TAB */}
        <TabsContent value="rmm">
          <Tabs value={rmmSubTab} onValueChange={changeRmmSub} className="mt-4">
            <TabsList>
              <TabsTrigger value="ninja">NinjaOne</TabsTrigger>
              <TabsTrigger value="screenconnect">ScreenConnect</TabsTrigger>
              <TabsTrigger value="ncentral">N-central</TabsTrigger>
            </TabsList>
            <TabsContent value="ninja">
              <div className="space-y-6 mt-4 max-w-2xl">
                <NinjaOneCard />
              </div>
            </TabsContent>
            <TabsContent value="screenconnect">
              <div className="space-y-6 mt-4 max-w-2xl">
                <ScreenConnectCard />
              </div>
            </TabsContent>
            <TabsContent value="ncentral">
              <div className="space-y-6 mt-4 max-w-2xl">
                <NCentralCard />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

          </Tabs>
        </TabsContent>

        {/* PRODUCT CATALOG TAB */}
        <TabsContent value="catalog">
          <div className="mt-4">
            <ProductCatalogPage />
          </div>
        </TabsContent>

        {/* AUDIT LOG TAB */}
        <TabsContent value="audit">
          <div className="mt-4">
            <AuditLogTab />
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
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.appliesToProducts}
                  onClick={() => setForm(f => ({ ...f, appliesToProducts: !f.appliesToProducts }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.appliesToProducts ? 'bg-green-500' : 'bg-input'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${form.appliesToProducts ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <Label>Applies to Products</Label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.appliesToServices}
                  onClick={() => setForm(f => ({ ...f, appliesToServices: !f.appliesToServices }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.appliesToServices ? 'bg-green-500' : 'bg-input'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${form.appliesToServices ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <Label>Applies to Services</Label>
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
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable billing email</span>
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

// ===== QUICKBOOKS ONLINE CARD =====

function QuickBooksCard() {
  const [status, setStatus] = useState<{ connected: boolean; companyName: string | null; isEnabled: boolean; lastSyncAt: string | null; syncStatus: string | null; syncError: string | null; syncFrequency: string }>({
    connected: false, companyName: null, isEnabled: false, lastSyncAt: null, syncStatus: null, syncError: null, syncFrequency: 'daily',
  });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof status>('/settings/quickbooks').then(setStatus).catch(() => {});

    // Handle OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const realmId = params.get('realmId');
    const state = params.get('state');
    if (code && realmId) {
      api<{ success: boolean; companyName: string }>('/integrations/quickbooks/callback', {
        method: 'POST', body: JSON.stringify({ code, realmId, state: state || '' }),
      }).then(res => {
        setMessage(`Connected to ${res.companyName}`);
        api<typeof status>('/settings/quickbooks').then(setStatus);
        window.history.replaceState({}, '', window.location.pathname);
      }).catch(err => setMessage(err instanceof Error ? err.message : 'Connection failed'));
    }
  }, []);

  async function connect() {
    const res = await api<{ authUrl: string }>('/integrations/quickbooks/authorize');
    window.location.href = res.authUrl;
  }

  async function disconnect() {
    if (!confirm('Disconnect QuickBooks Online?')) return;
    await api('/integrations/quickbooks/disconnect', { method: 'POST' });
    setStatus(s => ({ ...s, connected: false, companyName: null, isEnabled: false }));
    setMessage('Disconnected');
  }

  async function syncNow() {
    setSyncing(true); setMessage('');
    try {
      const res = await api<{ customers: number; invoices: number; payments: number }>('/settings/quickbooks/sync', { method: 'POST' });
      setMessage(`Synced ${res.customers} customers, ${res.invoices} invoices, ${res.payments} payments`);
      api<typeof status>('/settings/quickbooks').then(setStatus);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncing(false); }
  }

  async function updateFrequency(freq: string) {
    await api('/settings/quickbooks', { method: 'PUT', body: JSON.stringify({ syncFrequency: freq }) });
    setStatus(s => ({ ...s, syncFrequency: freq }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />QuickBooks Online</CardTitle>
        <CardDescription>Sync invoices, payments, and customers with QuickBooks Online for bookkeeping.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}

        {!status.connected ? (
          <Button onClick={connect}>Connect QuickBooks</Button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-green-100 text-green-800">Connected</Badge>
              {status.companyName && <span className="text-sm font-medium">{status.companyName}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Last Sync:</span>{' '}
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className={status.syncStatus === 'error' ? 'text-red-600' : ''}>{status.syncStatus || 'idle'}</span>
              </div>
            </div>

            {status.syncError && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{status.syncError}</div>
            )}

            <div className="flex items-center gap-3">
              <Label>Sync Frequency:</Label>
              <select
                value={status.syncFrequency}
                onChange={e => updateFrequency(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="15min">Every 15 min</option>
                <option value="30min">Every 30 min</option>
                <option value="hourly">Hourly</option>
                <option value="4hours">Every 4 hours</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</Button>
              <Button size="sm" variant="destructive" onClick={disconnect}>Disconnect</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== AI ASSISTANT SETTINGS =====

function AISettingsTab() {
  const [config, setConfig] = useState({ isEnabled: false, provider: 'anthropic' as 'anthropic' | 'openai', apiKey: '', model: 'claude-sonnet-4-20250514', personality: '', name: 'Atlas' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  const anthropicModels = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Faster, cheaper)' },
    { value: 'claude-opus-4-20250115', label: 'Claude Opus 4 (Most capable)' },
  ];
  const openaiModels = [
    { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, cheaper)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (High capability)' },
    { value: 'o3-mini', label: 'o3-mini (Reasoning)' },
  ];
  const models = config.provider === 'anthropic' ? anthropicModels : openaiModels;

  useEffect(() => {
    api<typeof config>('/settings/ai').then(data => setConfig({
      isEnabled: data.isEnabled ?? false,
      provider: (data.provider as 'anthropic' | 'openai') || 'anthropic',
      apiKey: data.apiKey || '',
      model: data.model || 'claude-sonnet-4-20250514',
      personality: data.personality || '',
      name: data.name || 'Atlas',
    })).catch(() => {});
  }, []);

  function changeProvider(provider: 'anthropic' | 'openai') {
    const defaultModel = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
    setConfig(c => ({ ...c, provider, model: defaultModel }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/ai', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('AI settings saved');
      const updated = await api<typeof config>('/settings/ai');
      setConfig({
        isEnabled: updated.isEnabled ?? false,
        provider: (updated.provider as 'anthropic' | 'openai') || 'anthropic',
        apiKey: updated.apiKey || '',
        model: updated.model || 'claude-sonnet-4-20250514',
        personality: updated.personality || '',
        name: updated.name || 'Atlas',
      });
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/ai/test', { method: 'POST', body: JSON.stringify({}) });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI Assistant</CardTitle>
          <CardDescription>Configure AI-powered features for ticket management. Choose your preferred provider for ticket summaries and reply improvement.</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Enable AI features</label>
              <button type="button" role="switch" aria-checked={config.isEnabled}
                onClick={() => setConfig(c => ({...c, isEnabled: !c.isEnabled}))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div>
              <Label>Provider</Label>
              <select value={config.provider} onChange={e => changeProvider(e.target.value as 'anthropic' | 'openai')}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (ChatGPT)</option>
              </select>
            </div>

            <div>
              <Label>Model</Label>
              <select value={config.model} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Assistant Name</Label>
              <Input value={config.name} onChange={e => setConfig(c => ({ ...c, name: e.target.value }))} placeholder="Atlas" />
              <p className="text-xs text-muted-foreground mt-1">The name your AI assistant uses when chatting</p>
            </div>

            <div>
              <Label>AI Personality & Tone</Label>
              <textarea value={config.personality} onChange={e => setConfig(c => ({ ...c, personality: e.target.value }))}
                placeholder="Professional and friendly. Address the customer by first name. Keep responses concise but helpful."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
              <p className="text-xs text-muted-foreground mt-1">Instructions that guide how the AI writes replies and summaries for your MSP</p>
            </div>

            <div>
              <Label>{config.provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}</Label>
              <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder={config.provider === 'anthropic' ? 'sk-ant-api03-...' : 'sk-...'} />
              <p className="text-xs text-muted-foreground mt-1">
                {config.provider === 'anthropic'
                  ? <>Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.anthropic.com</a></>
                  : <>Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></>
                }
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-medium">Features</div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> <strong>Ticket Summarize</strong> — AI reads the full ticket and generates a concise summary</div>
                <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> <strong>Improve Reply</strong> — AI rewrites your draft reply to be customer-friendly and professional</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== TWILIO CARD (SMS MFA) =====

function TwilioCard() {
  const [config, setConfig] = useState({ isEnabled: false, accountSid: '', authToken: '', fromNumber: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/twilio').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/twilio', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('Twilio settings saved');
      const updated = await api<typeof config>('/settings/twilio');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setMessage('');
    try {
      const res = await api<{ message: string }>('/settings/twilio/test', {
        method: 'POST', body: JSON.stringify({ phone: testPhone }),
      });
      setMessage(res.message);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Test failed'); }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Twilio (SMS MFA)</CardTitle>
        <CardDescription>Send SMS verification codes for portal user MFA. Get credentials at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.twilio.com</a>.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable Twilio SMS</span>
          </div>
          <div>
            <Label>Account SID</Label>
            <Input value={config.accountSid} onChange={e => setConfig(c => ({ ...c, accountSid: e.target.value }))} placeholder="AC..." />
          </div>
          <div>
            <Label>Auth Token</Label>
            <Input type="password" value={config.authToken} onChange={e => setConfig(c => ({ ...c, authToken: e.target.value }))} placeholder="Your auth token" />
          </div>
          <div>
            <Label>From Number (E.164 format)</Label>
            <Input value={config.fromNumber} onChange={e => setConfig(c => ({ ...c, fromNumber: e.target.value }))} placeholder="+18435551234" />
            <p className="text-xs text-muted-foreground mt-1">Must be a phone number purchased from your Twilio account, including the + and country code.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Twilio Settings'}</Button>
            <div className="flex items-center gap-2">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Test phone #" className="w-40" />
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !testPhone}>
                <Send className="h-4 w-4 mr-1" />{testing ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ===== CONNECTBOOSTER CARD =====

function ConnectBoosterCard() {
  const [config, setConfig] = useState({ isEnabled: false, apiKey: '', merchantId: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/connectbooster').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/connectbooster', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('ConnectBooster settings saved');
      const updated = await api<typeof config>('/settings/connectbooster');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />ConnectBooster</CardTitle>
        <CardDescription>MSP-focused payment processor with QuickBooks sync. Get credentials from your ConnectBooster account rep.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable ConnectBooster</span>
          </div>
          <div>
            <Label>Merchant ID</Label>
            <Input value={config.merchantId} onChange={e => setConfig(c => ({ ...c, merchantId: e.target.value }))} placeholder="Your ConnectBooster merchant ID" />
          </div>
          <div>
            <Label>API Key</Label>
            <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Your API key" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save ConnectBooster Settings'}</Button>
          <p className="text-xs text-muted-foreground">Integration coming soon. Credentials are stored encrypted.</p>
        </form>
      </CardContent>
    </Card>
  );
}

// ===== QBO PAYMENTS CARD =====

function QBOPaymentsCard() {
  const [status, setStatus] = useState({ isEnabled: false, qboConnected: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof status>('/settings/qbo-payments').then(setStatus).catch(() => {});
  }, []);

  async function toggleEnabled(enabled: boolean) {
    setSaving(true); setMessage('');
    try {
      await api('/settings/qbo-payments', { method: 'PUT', body: JSON.stringify({ isEnabled: enabled }) });
      setStatus(s => ({ ...s, isEnabled: enabled }));
      setMessage(enabled ? 'QBO Payments enabled' : 'QBO Payments disabled');
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />QuickBooks Payments</CardTitle>
        <CardDescription>Accept payments via QuickBooks Payments. Uses your existing QuickBooks Online connection.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        {!status.qboConnected ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm p-3 rounded-md border border-amber-200 dark:border-amber-800 space-y-3">
            <p>QuickBooks Online must be connected before you can enable QuickBooks Payments.</p>
            <Button size="sm" onClick={() => {
              window.location.hash = 'integrations/accounting/quickbooks';
              window.location.reload();
            }}>Go to Accounting → QuickBooks</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={status.isEnabled}
                onClick={() => toggleEnabled(!status.isEnabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${status.isEnabled ? 'bg-green-500' : 'bg-input'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${status.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm font-medium">Enable QuickBooks Payments</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ensure QuickBooks Payments is active in your QuickBooks Online account. Once enabled, invoices synced to QBO will include a "Pay Online" link powered by QB Payments.
            </p>
            <p className="text-xs text-muted-foreground">Integration coming soon. Setup activates the feature flag only.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== NINJAONE RMM CARD =====

function NinjaOneCard() {
  const [config, setConfig] = useState({ isEnabled: false, clientId: '', clientSecret: '', region: 'us' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/ninjaone').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/ninjaone', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('NinjaOne settings saved');
      const updated = await api<typeof config>('/settings/ninjaone');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />NinjaOne (NinjaRMM)</CardTitle>
        <CardDescription>Sync devices, alerts, and organizations from NinjaOne. Get API credentials in NinjaOne: Administration → Apps → API.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable NinjaOne Integration</span>
          </div>
          <div>
            <Label>Region</Label>
            <select value={config.region} onChange={e => setConfig(c => ({ ...c, region: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="us">US (app.ninjarmm.com)</option>
              <option value="us2">US2 (us2.ninjarmm.com)</option>
              <option value="eu">EU (eu.ninjarmm.com)</option>
              <option value="ca">Canada (ca.ninjarmm.com)</option>
              <option value="oc">Oceania (oc.ninjarmm.com)</option>
            </select>
          </div>
          <div>
            <Label>Client ID</Label>
            <Input value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))} placeholder="Your NinjaOne API client ID" />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input type="password" value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))} placeholder="Your NinjaOne API client secret" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save NinjaOne Settings'}</Button>
          <p className="text-xs text-muted-foreground">Full device/alert sync coming soon. Credentials are stored encrypted.</p>
        </form>
      </CardContent>
    </Card>
  );
}


// ===== CREWHU CSAT CARD =====

function CrewHuCard() {
  const [config, setConfig] = useState({ isEnabled: false, apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<typeof config>('/settings/crewhu').then(setConfig).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api('/settings/crewhu', { method: 'PUT', body: JSON.stringify(config) });
      setMessage('CrewHu settings saved');
      const updated = await api<typeof config>('/settings/crewhu');
      setConfig(updated);
    } catch (err: unknown) { setMessage(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smile className="h-5 w-5" />CrewHu (CSAT)</CardTitle>
        <CardDescription>Customer satisfaction surveys for closed tickets. Get your API key from <a href="https://get-help-tnt.crewhu.com/hc/en-us/articles/360002286094-Open-API" target="_blank" rel="noopener noreferrer" className="text-primary underline">CrewHu Open API docs</a>.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{message}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={config.isEnabled}
              onClick={() => setConfig(c => ({ ...c, isEnabled: !c.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium">Enable CrewHu CSAT</span>
          </div>
          <div>
            <Label>API Key</Label>
            <Input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Your CrewHu API key" />
            <p className="text-xs text-muted-foreground mt-1">In CrewHu: Settings → Integrations → Open API. Copy the API key.</p>
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save CrewHu Settings'}</Button>
          <p className="text-xs text-muted-foreground">Once enabled, CSAT surveys will be sent to customers when tickets are closed. Full integration coming soon; credentials are stored encrypted now.</p>
        </form>
      </CardContent>
    </Card>
  );
}

// ===== SCREENCONNECT CARD =====

function ScreenConnectCard() {
  const [scConfig, setScConfig] = useState({
    isEnabled: false,
    serverUrl: 'https://rivertowntechnology.screenconnect.com',
    username: '',
    password: '',
    totpSecret: '',
    syncFrequency: '15min',
    companyProperty: '1',
  });
  const [scLoaded, setScLoaded] = useState(false);
  const [scSaving, setScSaving] = useState(false);
  const [scSuccess, setScSuccess] = useState('');
  const [scTesting, setScTesting] = useState(false);
  const [scTestResult, setScTestResult] = useState('');
  const [scLastSync, setScLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (scLoaded) return;
    api<{ isEnabled: boolean; serverUrl: string; username: string; password: string; totpSecret: string; syncFrequency: string; companyProperty: string; lastSyncAt: string | null }>('/settings/screenconnect')
      .then(data => {
        setScConfig({
          isEnabled: data.isEnabled,
          serverUrl: data.serverUrl || 'https://rivertowntechnology.screenconnect.com',
          username: data.username || '',
          password: data.password || '',
          totpSecret: data.totpSecret || '',
          syncFrequency: data.syncFrequency || '15min',
          companyProperty: data.companyProperty || '1',
        });
        setScLastSync(data.lastSyncAt);
        setScLoaded(true);
      })
      .catch(() => setScLoaded(true));
  }, [scLoaded]);

  async function saveScreenConnect() {
    setScSaving(true); setScSuccess('');
    try {
      await api('/settings/screenconnect', { method: 'PUT', body: JSON.stringify(scConfig) });
      setScSuccess('ScreenConnect settings saved');
      setTimeout(() => setScSuccess(''), 3000);
    } catch { /* */ }
    finally { setScSaving(false); }
  }

  async function testScreenConnect() {
    setScTesting(true); setScTestResult('');
    try {
      const res = await api<{ success: boolean; message: string }>('/settings/screenconnect/test', { method: 'POST' });
      setScTestResult(res.message);
    } catch (e: unknown) {
      setScTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setScTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          ScreenConnect (ConnectWise Control)
          {scConfig.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Sync remote access sessions and online status from ScreenConnect. Assets will be matched by company name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scSuccess && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{scSuccess}</div>}
        {scTestResult && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{scTestResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable ScreenConnect</div>
            <div className="text-sm text-muted-foreground">Sync sessions and online status from your ScreenConnect instance</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scConfig.isEnabled}
            onClick={() => setScConfig({ ...scConfig, isEnabled: !scConfig.isEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${scConfig.isEnabled ? 'bg-green-500' : 'bg-input'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${scConfig.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Server URL</Label>
          <Input value={scConfig.serverUrl} onChange={e => setScConfig({ ...scConfig, serverUrl: e.target.value })} placeholder="https://yourcompany.screenconnect.com" />
          <p className="text-xs text-muted-foreground">Your ScreenConnect (ConnectWise Control) instance URL</p>
        </div>

        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={scConfig.username} onChange={e => setScConfig({ ...scConfig, username: e.target.value })} placeholder="API user account" />
          <p className="text-xs text-muted-foreground">Create a dedicated API user in ScreenConnect: Admin &rarr; Security &rarr; User Table</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={scConfig.password} onChange={e => setScConfig({ ...scConfig, password: e.target.value })} placeholder="API user password" />
          </div>
          <div className="space-y-2">
            <Label>TOTP Secret</Label>
            <Input type="password" value={scConfig.totpSecret} onChange={e => setScConfig({ ...scConfig, totpSecret: e.target.value })} placeholder="Base32 MFA secret" />
            <p className="text-xs text-muted-foreground">The base32 secret from your MFA setup (not the 6-digit code)</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Company Property</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={scConfig.companyProperty}
            onChange={e => setScConfig({ ...scConfig, companyProperty: e.target.value })}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <option key={n} value={String(n)}>CustomProperty{n}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Which CustomProperty on sessions holds the company name for matching</p>
        </div>

        <div className="space-y-2">
          <Label>Sync Frequency</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={scConfig.syncFrequency}
            onChange={e => setScConfig({ ...scConfig, syncFrequency: e.target.value })}
          >
            <option value="5min">Every 5 minutes</option>
            <option value="15min">Every 15 minutes</option>
            <option value="30min">Every 30 minutes</option>
            <option value="hourly">Every hour</option>
            <option value="4hours">Every 4 hours</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        {scLastSync && (
          <p className="text-xs text-muted-foreground">Last synced: {new Date(scLastSync).toLocaleString()}</p>
        )}

        <div className="flex gap-2">
          <Button onClick={saveScreenConnect} disabled={scSaving}>{scSaving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testScreenConnect} disabled={scTesting || !scConfig.isEnabled}>
            {scTesting ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== N-CENTRAL CARD =====

function NCentralCard() {
  const [config, setConfig] = useState({
    isEnabled: false,
    serverUrl: '',
    jwtToken: '',
    syncFrequency: '15min',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    api<{ isEnabled: boolean; serverUrl: string; jwtToken: string; syncFrequency: string; lastSyncAt: string | null }>('/settings/ncentral')
      .then(data => {
        setConfig({
          isEnabled: data.isEnabled,
          serverUrl: data.serverUrl || '',
          jwtToken: data.jwtToken || '',
          syncFrequency: data.syncFrequency || '15min',
        });
        setLastSync(data.lastSyncAt);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  async function saveNCentral() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/ncentral', { method: 'PUT', body: JSON.stringify(config) });
      setSuccess('N-central settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  async function testNCentral() {
    setTesting(true); setTestResult('');
    try {
      const res = await api<{ success: boolean; message: string }>('/settings/ncentral/test', { method: 'POST' });
      setTestResult(res.message);
    } catch (e: unknown) {
      setTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          N-central
          {config.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Sync devices and monitoring status from N-central. Assets will be matched by device name and customer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}
        {testResult && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-md border border-blue-200 dark:border-blue-800 mb-4">{testResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable N-central</div>
            <div className="text-sm text-muted-foreground">Sync devices and monitoring data from your N-central instance</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.isEnabled}
            onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Server URL</Label>
          <Input value={config.serverUrl} onChange={e => setConfig({ ...config, serverUrl: e.target.value })} placeholder="https://your-ncentral-server.com" />
          <p className="text-xs text-muted-foreground">Your N-central server FQDN</p>
        </div>

        <div className="space-y-2">
          <Label>JWT Token</Label>
          <Input type="password" value={config.jwtToken} onChange={e => setConfig({ ...config, jwtToken: e.target.value })} placeholder="JWT token from N-central" />
          <p className="text-xs text-muted-foreground">Generate in N-central: Administration &rarr; User Management &rarr; Users &rarr; [User] &rarr; API Access &rarr; Generate JSON Web Token</p>
        </div>

        <div className="space-y-2">
          <Label>Sync Frequency</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={config.syncFrequency}
            onChange={e => setConfig({ ...config, syncFrequency: e.target.value })}
          >
            <option value="15min">Every 15 minutes</option>
            <option value="30min">Every 30 minutes</option>
            <option value="hourly">Every hour</option>
            <option value="4hours">Every 4 hours</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        {lastSync && (
          <p className="text-xs text-muted-foreground">Last synced: {new Date(lastSync).toLocaleString()}</p>
        )}

        <div className="flex gap-2">
          <Button onClick={saveNCentral} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testNCentral} disabled={testing || !config.isEnabled}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StorageCard() {
  const [config, setConfig] = useState({
    isEnabled: false,
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: 'rivertown-psa',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    if (loaded) return;
    api<{ isEnabled: boolean; accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string }>('/settings/storage')
      .then(data => {
        setConfig({
          isEnabled: data.isEnabled,
          accountId: data.accountId || '',
          accessKeyId: data.accessKeyId || '',
          secretAccessKey: data.secretAccessKey || '',
          bucketName: data.bucketName || 'rivertown-psa',
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  async function saveStorage() {
    setSaving(true); setSuccess('');
    try {
      await api('/settings/storage', { method: 'PUT', body: JSON.stringify(config) });
      setSuccess('Storage settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  async function testStorage() {
    setTesting(true); setTestResult('');
    try {
      const res = await api<{ success: boolean; error?: string }>('/settings/storage/test', { method: 'POST' });
      setTestResult(res.success ? 'Connection successful! Bucket is accessible.' : (res.error || 'Test failed'));
    } catch (e: unknown) {
      setTestResult(e instanceof Error ? e.message : 'Test failed');
    }
    finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Cloudflare R2 Storage
          {config.isEnabled && <Badge variant="default" className="ml-2">Enabled</Badge>}
        </CardTitle>
        <CardDescription>Configure Cloudflare R2 for file attachments, document storage, and backups.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}
        {testResult && <div className={`text-sm p-3 rounded-md border mb-4 ${testResult.includes('successful') ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'}`}>{testResult}</div>}

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Enable R2 Storage</div>
            <div className="text-sm text-muted-foreground">Store file attachments in Cloudflare R2</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.isEnabled}
            onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${config.isEnabled ? 'bg-green-500' : 'bg-input'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${config.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Account ID</Label>
          <Input value={config.accountId} onChange={e => setConfig({ ...config, accountId: e.target.value })} placeholder="Your Cloudflare account ID" />
          <p className="text-xs text-muted-foreground">Found in Cloudflare dashboard URL: dash.cloudflare.com/&lt;account-id&gt;</p>
        </div>

        <div className="space-y-2">
          <Label>Access Key ID</Label>
          <Input value={config.accessKeyId} onChange={e => setConfig({ ...config, accessKeyId: e.target.value })} placeholder="R2 API token access key" />
        </div>

        <div className="space-y-2">
          <Label>Secret Access Key</Label>
          <Input type="password" value={config.secretAccessKey} onChange={e => setConfig({ ...config, secretAccessKey: e.target.value })} placeholder="R2 API token secret" />
          <p className="text-xs text-muted-foreground">Create an R2 API token in Cloudflare: R2 &gt; Manage R2 API Tokens</p>
        </div>

        <div className="space-y-2">
          <Label>Bucket Name</Label>
          <Input value={config.bucketName} onChange={e => setConfig({ ...config, bucketName: e.target.value })} placeholder="rivertown-psa" />
          <p className="text-xs text-muted-foreground">The R2 bucket name for storing files</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={saveStorage} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outline" onClick={testStorage} disabled={testing || !config.isEnabled}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Canned Responses Tab
// ---------------------------------------------------------------------------

interface CannedResponse {
  id: string;
  name: string;
  category: string | null;
  body: string;
  isShared: boolean;
  createdAt: string;
}

function CannedResponsesTab() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: '', body: '', isShared: true });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadResponses() {
    setLoading(true);
    try {
      const data = await api<CannedResponse[]>('/canned-responses');
      setResponses(Array.isArray(data) ? data : []);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadResponses(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', category: '', body: '', isShared: true });
    setShowDialog(true);
  }

  function openEdit(r: CannedResponse) {
    setEditingId(r.id);
    setForm({ name: r.name, category: r.category || '', body: r.body, isShared: r.isShared });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        body: form.body.trim(),
        isShared: form.isShared,
      };
      if (editingId) {
        await api(`/canned-responses/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/canned-responses', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false);
      await loadResponses();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/canned-responses/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadResponses();
  }

  const filtered = responses.filter(r =>
    !searchQuery ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = [...new Set(responses.map(r => r.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Canned Responses</CardTitle>
              <CardDescription>Pre-written replies for common ticket scenarios</CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Response</Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search responses..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {responses.length === 0 ? 'No canned responses yet. Create one to get started.' : 'No results match your search.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => (
                <div key={r.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{r.name}</span>
                        {r.category && (
                          <Badge variant="outline" className="text-xs">{r.category}</Badge>
                        )}
                        {r.isShared && (
                          <Badge variant="secondary" className="text-xs">Shared</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{r.body}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Canned Response' : 'New Canned Response'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Password Reset Instructions" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. General, Networking, Email"
                list="canned-categories" />
              {categories.length > 0 && (
                <datalist id="canned-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <textarea
                rows={6}
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="Write the response text..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isShared}
                onChange={e => setForm({ ...form, isShared: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Shared with all technicians</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.body.trim()}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Canned Response"
        description="Are you sure you want to delete this canned response? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ===== CUSTOM FIELDS TAB =====

interface CustomFieldDef {
  id: string;
  entityType: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: unknown;
  required: boolean;
  sortOrder: number;
  createdAt: string;
}

function toSnakeCase(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function CustomFieldsTab() {
  const [entityType, setEntityType] = useState('ticket');
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ fieldLabel: '', fieldName: '', fieldType: 'text', options: '', required: false });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadFields(et?: string) {
    setLoading(true);
    try {
      const data = await api<CustomFieldDef[]>(`/settings/custom-fields?entityType=${et || entityType}`);
      setFields(Array.isArray(data) ? data : []);
    } catch { setFields([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadFields(); }, [entityType]);

  function openCreate() {
    setEditingId(null);
    setForm({ fieldLabel: '', fieldName: '', fieldType: 'text', options: '', required: false });
    setShowDialog(true);
  }

  function openEdit(f: CustomFieldDef) {
    setEditingId(f.id);
    const opts = Array.isArray(f.options) ? (f.options as Array<{ value: string; label: string }>).map(o => o.label || o.value).join('\n') : '';
    setForm({ fieldLabel: f.fieldLabel, fieldName: f.fieldName, fieldType: f.fieldType, options: opts, required: f.required });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.fieldLabel.trim()) return;
    setSaving(true);
    try {
      const optionsArr = form.fieldType === 'dropdown' && form.options.trim()
        ? form.options.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map(s => ({ value: toSnakeCase(s), label: s }))
        : null;
      const payload = {
        entityType,
        fieldLabel: form.fieldLabel.trim(),
        fieldName: form.fieldName.trim() || toSnakeCase(form.fieldLabel),
        fieldType: form.fieldType,
        options: optionsArr,
        required: form.required,
      };
      if (editingId) {
        await api(`/settings/custom-fields/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/custom-fields', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false);
      await loadFields();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/custom-fields/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadFields();
  }

  const typeBadge: Record<string, string> = {
    text: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    number: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    dropdown: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    date: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    checkbox: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['ticket', 'customer', 'asset'] as const).map(et => (
            <Button key={et} variant={entityType === et ? 'default' : 'outline'} size="sm"
              onClick={() => setEntityType(et)}>
              {et.charAt(0).toUpperCase() + et.slice(1)}s
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Field</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Label</th>
              <th className="text-left p-3 font-medium">Field Name</th>
              <th className="text-center p-3 font-medium">Type</th>
              <th className="text-center p-3 font-medium">Required</th>
              <th className="w-20"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : fields.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No custom fields defined for {entityType}s. Click "Add Field" to create one.</td></tr>
              ) : fields.map(f => (
                <tr key={f.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{f.fieldLabel}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{f.fieldName}</td>
                  <td className="p-3 text-center"><Badge variant="secondary" className={`text-xs ${typeBadge[f.fieldType] || ''}`}>{f.fieldType}</Badge></td>
                  <td className="p-3 text-center">{f.required && <Badge variant="outline" className="text-xs">Required</Badge>}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Field Label</Label>
              <Input value={form.fieldLabel} onChange={e => {
                const label = e.target.value;
                setForm(f => ({ ...f, fieldLabel: label, fieldName: editingId ? f.fieldName : toSnakeCase(label) }));
              }} placeholder="e.g. Location" />
            </div>
            <div className="space-y-2">
              <Label>Field Name (internal)</Label>
              <Input value={form.fieldName} onChange={e => setForm({ ...form, fieldName: e.target.value })} placeholder="auto-generated from label" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <select value={form.fieldType} onChange={e => setForm({ ...form, fieldType: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
            {form.fieldType === 'dropdown' && (
              <div className="space-y-2">
                <Label>Options (one per line or comma-separated)</Label>
                <textarea rows={4} value={form.options} onChange={e => setForm({ ...form, options: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Option 1&#10;Option 2&#10;Option 3" />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="rounded border-gray-300" />
              <span className="text-sm">Required field</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.fieldLabel.trim()}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Custom Field"
        description="Are you sure you want to delete this custom field? All values for this field will also be removed. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ===== TICKET TEMPLATES TAB =====

interface TicketTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
  priority: string;
  category: string;
}

function TicketTemplatesTab() {
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', subject: '', body: '', priority: 'medium', category: '' });
  const [saving, setSaving] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await api<TicketTemplate[]>('/settings/ticket-templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch { setTemplates([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTemplates(); }, []);

  function openCreate() {
    setEditingIdx(null);
    setForm({ name: '', description: '', subject: '', body: '', priority: 'medium', category: '' });
    setShowDialog(true);
  }

  function openEdit(idx: number) {
    const t = templates[idx];
    setEditingIdx(idx);
    setForm({ name: t.name, description: t.description || '', subject: t.subject || '', body: t.body || '', priority: t.priority || 'medium', category: t.category || '' });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const entry: TicketTemplate = {
        id: editingIdx !== null ? templates[editingIdx].id : crypto.randomUUID(),
        name: form.name.trim(),
        description: form.description.trim(),
        subject: form.subject.trim(),
        body: form.body.trim(),
        priority: form.priority,
        category: form.category.trim(),
      };
      let updated: TicketTemplate[];
      if (editingIdx !== null) {
        updated = templates.map((t, i) => i === editingIdx ? entry : t);
      } else {
        updated = [...templates, entry];
      }
      await api('/settings/ticket-templates', { method: 'PUT', body: JSON.stringify(updated) });
      setShowDialog(false);
      await loadTemplates();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (deleteIdx === null) return;
    const updated = templates.filter((_, i) => i !== deleteIdx);
    await api('/settings/ticket-templates', { method: 'PUT', body: JSON.stringify(updated) });
    setDeleteIdx(null);
    await loadTemplates();
  }

  const priorityLabel: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Ticket Templates</h3>
          <p className="text-xs text-muted-foreground">Pre-fill ticket fields for common requests</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Template</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Subject</th>
              <th className="text-center p-3 font-medium">Priority</th>
              <th className="text-left p-3 font-medium">Category</th>
              <th className="w-20"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No ticket templates yet. Click "Add Template" to create one.</td></tr>
              ) : templates.map((t, idx) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{t.subject || '-'}</td>
                  <td className="p-3 text-center"><Badge variant="outline" className="text-xs capitalize">{priorityLabel[t.priority] || t.priority}</Badge></td>
                  <td className="p-3 text-muted-foreground">{t.category || '-'}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(idx)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteIdx(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIdx !== null ? 'Edit Template' : 'Add Ticket Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. New Employee Onboarding" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of when to use this template" />
            </div>
            <div className="space-y-2">
              <Label>Default Subject</Label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Subject line for the ticket" />
            </div>
            <div className="space-y-2">
              <Label>Default Description</Label>
              <textarea rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Pre-filled ticket description..." />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Optional category name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : editingIdx !== null ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteIdx !== null}
        onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}
        title="Delete Template"
        description="Are you sure you want to delete this ticket template? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ===== AUDIT LOG TAB =====

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

function AuditLogTab() {
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

// ===== CATEGORIES TAB =====
function CategoriesTab() {
  interface Category { id: string; name: string; sortOrder: number; subcategories: Array<{ id: string; name: string; sortOrder: number }>; }
  const [categories, setCategories] = useState<Category[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({ name: '' });
  const [subSaving, setSubSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSubId, setDeleteSubId] = useState<{ catId: string; subId: string } | null>(null);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    try {
      const data = await api<Category[]>('/ticket-categories');
      setCategories(data);
    } catch { setCategories([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '' }); setShowDialog(true); }
  function openEdit(cat: Category) { setEditId(cat.id); setForm({ name: cat.name }); setShowDialog(true); }
  function openAddSub(catId: string) { setSubParentId(catId); setEditSubId(null); setSubForm({ name: '' }); setShowSubDialog(true); }
  function openEditSub(catId: string, sub: { id: string; name: string }) { setSubParentId(catId); setEditSubId(sub.id); setSubForm({ name: sub.name }); setShowSubDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-categories/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-categories', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadCategories();
    } finally { setSaving(false); }
  }

  async function handleSubSave(e: React.FormEvent) {
    e.preventDefault(); setSubSaving(true);
    try {
      if (editSubId && subParentId) {
        await api(`/settings/ticket-categories/${subParentId}/subcategories/${editSubId}`, { method: 'PATCH', body: JSON.stringify(subForm) });
      } else if (subParentId) {
        await api(`/settings/ticket-categories/${subParentId}/subcategories`, { method: 'POST', body: JSON.stringify(subForm) });
      }
      setShowSubDialog(false); loadCategories();
    } finally { setSubSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-categories/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadCategories();
  }

  async function handleDeleteSub() {
    if (!deleteSubId) return;
    await api(`/settings/ticket-categories/${deleteSubId.catId}/subcategories/${deleteSubId.subId}`, { method: 'DELETE' });
    setDeleteSubId(null); loadCategories();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ticket Categories</CardTitle>
              <CardDescription>Organize tickets into categories and subcategories</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Category</Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No categories yet. Click "Add Category" to create one.</div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="border rounded-lg">
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <span className="font-medium text-sm">{cat.name}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openAddSub(cat.id)}><Plus className="h-3 w-3 mr-1" />Sub</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(cat.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  {cat.subcategories.length > 0 && (
                    <div className="divide-y">
                      {cat.subcategories.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between px-3 py-2 pl-8">
                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSub(cat.id, sub)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeleteSubId({ catId: cat.id, subId: sub.id })}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="Category name" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubDialog} onOpenChange={setShowSubDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editSubId ? 'Edit Subcategory' : 'Add Subcategory'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={subForm.name} onChange={e => setSubForm({ name: e.target.value })} placeholder="Subcategory name" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={subSaving}>{subSaving ? 'Saving...' : editSubId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Category" description="This will delete the category and all its subcategories. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
      <ConfirmDialog open={!!deleteSubId} onOpenChange={() => setDeleteSubId(null)} title="Delete Subcategory" description="This will delete the subcategory. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteSub} />
    </div>
  );
}

// ===== QUEUES TAB =====
function QueuesTab() {
  interface Queue { id: string; name: string; description: string | null; color: string; isDefault: boolean; }
  const PRESET_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#6b7280', '#f97316', '#ec4899', '#06b6d4', '#14b8a6'];
  const [queues, setQueues] = useState<Queue[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6', isDefault: false });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadQueues(); }, []);

  async function loadQueues() {
    try {
      const data = await api<Queue[]>('/settings/ticket-queues');
      setQueues(data);
    } catch { setQueues([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '', description: '', color: '#3b82f6', isDefault: false }); setShowDialog(true); }
  function openEdit(q: Queue) { setEditId(q.id); setForm({ name: q.name, description: q.description ?? '', color: q.color, isDefault: q.isDefault }); setShowDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-queues/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-queues', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadQueues();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-queues/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadQueues();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Service Queues</CardTitle>
              <CardDescription>Organize tickets into queues for team routing</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Queue</Button>
          </div>
        </CardHeader>
        <CardContent>
          {queues.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No queues yet. Click "Add Queue" to create one.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {queues.map(q => (
                <div key={q.id} className="border rounded-lg p-4 flex items-start gap-3">
                  <div className="h-3 w-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: q.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{q.name}</span>
                      {q.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                    </div>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(q)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Queue' : 'Add Queue'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Queue name" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" className={`h-7 w-7 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setForm({ ...form, color: c })} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={form.isDefault} onClick={() => setForm({ ...form, isDefault: !form.isDefault })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.isDefault ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.isDefault ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <Label>Default queue</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Queue" description="This will remove the queue. Tickets in this queue will become unqueued." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}

// ===== TAGS TAB =====
function TagsTab() {
  interface Tag { id: string; name: string; color: string; }
  const PRESET_COLORS = [
    { name: 'Red', value: '#ef4444' }, { name: 'Blue', value: '#3b82f6' }, { name: 'Green', value: '#22c55e' },
    { name: 'Yellow', value: '#eab308' }, { name: 'Purple', value: '#8b5cf6' }, { name: 'Gray', value: '#6b7280' },
    { name: 'Orange', value: '#f97316' }, { name: 'Pink', value: '#ec4899' },
  ];
  const [tags, setTags] = useState<Tag[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    try {
      const data = await api<Tag[]>('/settings/ticket-tags');
      setTags(data);
    } catch { setTags([]); }
  }

  function openAdd() { setEditId(null); setForm({ name: '', color: '#3b82f6' }); setShowDialog(true); }
  function openEdit(t: Tag) { setEditId(t.id); setForm({ name: t.name, color: t.color }); setShowDialog(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api(`/settings/ticket-tags/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/settings/ticket-tags', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowDialog(false); loadTags();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/ticket-tags/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadTags();
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ticket Tags</CardTitle>
              <CardDescription>Create color-coded tags for organizing and filtering tickets</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Tag</Button>
          </div>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No tags yet. Click "Add Tag" to create one.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <div key={t.id} className="inline-flex items-center gap-1.5 group">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white cursor-pointer hover:opacity-80" style={{ backgroundColor: t.color }} onClick={() => openEdit(t)}>
                    {t.name}
                  </span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Tag' : 'Add Tag'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tag name" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c.value} type="button" className={`h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center ${form.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c.value }} onClick={() => setForm({ ...form, color: c.value })} title={c.name}>
                    {form.color === c.value && <span className="text-white text-xs font-bold">&#10003;</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: form.color }}>
                  {form.name || 'Preview'}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Tag" description="This will remove the tag from all tickets. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}

// ===== RECURRING TICKETS TAB =====
function RecurringTicketsTab() {
  interface RecurringRule {
    id: string; name: string; frequency: string; dayOfWeek: number | null; dayOfMonth: number | null;
    customerId: string | null; customerName?: string; subject: string; description: string | null;
    priority: string; categoryId: string | null; assignedTo: string | null; queueId: string | null;
    isActive: boolean; lastRunAt: string | null; nextRunAt: string | null;
  }
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1,
    customerId: '', subject: '', description: '', priority: 'medium',
    categoryId: '', assignedTo: '', queueId: '', isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [techs, setTechs] = useState<Array<{ id: string; displayName: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [queuesOpts, setQueuesOpts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadRules();
    api<{ data: Array<{ id: string; name: string }> }>('/customers?limit=200').then(d => setCustomers(d.data ?? [])).catch(() => {});
    api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
    api<Array<{ id: string; name: string }>>('/ticket-categories').then(setCategories).catch(() => {});
    api<Array<{ id: string; name: string }>>('/settings/ticket-queues').then(setQueuesOpts).catch(() => {});
  }, []);

  async function loadRules() {
    try { const data = await api<RecurringRule[]>('/settings/recurring-tickets'); setRules(data); }
    catch { setRules([]); }
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, customerId: '', subject: '', description: '', priority: 'medium', categoryId: '', assignedTo: '', queueId: '', isActive: true });
    setShowDialog(true);
  }
  function openEdit(r: RecurringRule) {
    setEditId(r.id);
    setForm({
      name: r.name, frequency: r.frequency, dayOfWeek: r.dayOfWeek ?? 1, dayOfMonth: r.dayOfMonth ?? 1,
      customerId: r.customerId ?? '', subject: r.subject, description: r.description ?? '',
      priority: r.priority, categoryId: r.categoryId ?? '', assignedTo: r.assignedTo ?? '',
      queueId: r.queueId ?? '', isActive: r.isActive,
    });
    setShowDialog(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.customerId) payload.customerId = null;
      if (!payload.categoryId) payload.categoryId = null;
      if (!payload.assignedTo) payload.assignedTo = null;
      if (!payload.queueId) payload.queueId = null;
      if (payload.frequency !== 'weekly') delete payload.dayOfWeek;
      if (payload.frequency !== 'monthly') delete payload.dayOfMonth;
      if (editId) {
        await api(`/settings/recurring-tickets/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/recurring-tickets', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false); loadRules();
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api(`/settings/recurring-tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
    loadRules();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/recurring-tickets/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadRules();
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recurring Tickets</CardTitle>
              <CardDescription>Automatically create tickets on a schedule</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-4">No recurring ticket rules yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Frequency</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Last Run</th>
                <th className="text-left p-3 font-medium">Next Run</th>
                <th className="w-20"></th>
              </tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 capitalize">{r.frequency}{r.frequency === 'weekly' && r.dayOfWeek !== null ? ` (${DAYS[r.dayOfWeek]})` : r.frequency === 'monthly' && r.dayOfMonth ? ` (${r.dayOfMonth}${['st','nd','rd'][r.dayOfMonth-1] || 'th'})` : ''}</td>
                    <td className="p-3 text-muted-foreground">{r.customerName || '-'}</td>
                    <td className="p-3 truncate max-w-[200px]">{r.subject}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleActive(r.id, !r.isActive)}>
                        <Badge variant={r.isActive ? 'default' : 'secondary'} className={r.isActive ? 'bg-green-600' : ''}>{r.isActive ? 'Active' : 'Paused'}</Badge>
                      </button>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{r.lastRunAt ? new Date(r.lastRunAt).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.nextRunAt ? new Date(r.nextRunAt).toLocaleDateString() : '-'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Recurring Rule' : 'Add Recurring Rule'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Monthly server maintenance" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {form.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: parseInt(e.target.value) })}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Input type="number" min="1" max="28" value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: parseInt(e.target.value) || 1 })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Combobox
                options={[{ value: '', label: 'No customer (internal)' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
                value={form.customerId}
                onValueChange={v => setForm({ ...form, customerId: v })}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
              />
            </div>
            <div className="space-y-2"><Label>Subject</Label><Input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ticket subject" /></div>
            <div className="space-y-2"><Label>Description</Label><textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder="Ticket description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Queue</Label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.queueId} onChange={e => setForm({ ...form, queueId: e.target.value })}>
                  <option value="">No queue</option>
                  {queuesOpts.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={form.isActive} onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.isActive ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Rule" description="This will delete the recurring ticket rule. Existing tickets created by this rule will not be affected." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}

// ===== WORKFLOW RULES TAB =====
function WorkflowRulesTab() {
  interface WorkflowCondition { field: string; operator: string; value: string; }
  interface WorkflowAction { type: string; params: Record<string, string>; }
  interface WorkflowRule {
    id: string; name: string; description: string | null; trigger: string;
    conditions: WorkflowCondition[]; actions: WorkflowAction[];
    isActive: boolean; executionCount: number;
  }
  const TRIGGERS = [
    { value: 'ticket_created', label: 'Ticket Created' },
    { value: 'ticket_updated', label: 'Ticket Updated' },
    { value: 'ticket_status_changed', label: 'Status Changed' },
    { value: 'customer_reply', label: 'Customer Reply' },
    { value: 'sla_warning', label: 'SLA Warning' },
  ];
  const CONDITION_FIELDS = [
    { value: 'priority', label: 'Priority' },
    { value: 'status', label: 'Status' },
    { value: 'source', label: 'Source' },
    { value: 'queueId', label: 'Queue' },
    { value: 'customerId', label: 'Customer' },
  ];
  const CONDITION_OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'in', label: 'In' },
  ];
  const ACTION_TYPES = [
    { value: 'assign_to', label: 'Assign To' },
    { value: 'set_priority', label: 'Set Priority' },
    { value: 'set_status', label: 'Set Status' },
    { value: 'set_queue', label: 'Set Queue' },
    { value: 'send_notification', label: 'Send Notification' },
  ];

  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', trigger: 'ticket_created',
    conditions: [] as WorkflowCondition[], actions: [] as WorkflowAction[], isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [techs, setTechs] = useState<Array<{ id: string; displayName: string }>>([]);
  const [queuesOpts, setQueuesOpts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadRules();
    api<Array<{ id: string; displayName: string }>>('/dispatch/techs').then(setTechs).catch(() => {});
    api<Array<{ id: string; name: string }>>('/settings/ticket-queues').then(setQueuesOpts).catch(() => {});
  }, []);

  async function loadRules() {
    try { const data = await api<WorkflowRule[]>('/settings/workflow-rules'); setRules(data); }
    catch { setRules([]); }
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', description: '', trigger: 'ticket_created', conditions: [], actions: [], isActive: true });
    setShowDialog(true);
  }
  function openEdit(r: WorkflowRule) {
    setEditId(r.id);
    setForm({ name: r.name, description: r.description ?? '', trigger: r.trigger, conditions: r.conditions, actions: r.actions, isActive: r.isActive });
    setShowDialog(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      if (editId) {
        await api(`/settings/workflow-rules/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/settings/workflow-rules', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowDialog(false); loadRules();
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api(`/settings/workflow-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
    loadRules();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await api(`/settings/workflow-rules/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); loadRules();
  }

  function addCondition() {
    setForm({ ...form, conditions: [...form.conditions, { field: 'priority', operator: 'equals', value: '' }] });
  }
  function updateCondition(idx: number, updates: Partial<WorkflowCondition>) {
    setForm({ ...form, conditions: form.conditions.map((c, i) => i === idx ? { ...c, ...updates } : c) });
  }
  function removeCondition(idx: number) {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== idx) });
  }
  function addAction() {
    setForm({ ...form, actions: [...form.actions, { type: 'set_priority', params: {} }] });
  }
  function updateAction(idx: number, updates: Partial<WorkflowAction>) {
    setForm({ ...form, actions: form.actions.map((a, i) => i === idx ? { ...a, ...updates } : a) });
  }
  function removeAction(idx: number) {
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workflow Rules</CardTitle>
              <CardDescription>Automate ticket actions based on triggers and conditions</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-4">No workflow rules yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Trigger</th>
                <th className="text-center p-3 font-medium">Conditions</th>
                <th className="text-center p-3 font-medium">Actions</th>
                <th className="text-center p-3 font-medium">Active</th>
                <th className="text-center p-3 font-medium">Executions</th>
                <th className="w-20"></th>
              </tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3"><div className="font-medium">{r.name}</div>{r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{TRIGGERS.find(t => t.value === r.trigger)?.label || r.trigger}</Badge></td>
                    <td className="p-3 text-center">{r.conditions.length}</td>
                    <td className="p-3 text-center">{r.actions.length}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleActive(r.id, !r.isActive)}>
                        <Badge variant={r.isActive ? 'default' : 'secondary'} className={r.isActive ? 'bg-green-600' : ''}>{r.isActive ? 'On' : 'Off'}</Badge>
                      </button>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">{r.executionCount}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit Workflow Rule' : 'Add Workflow Rule'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rule name" /></div>
              <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {form.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions - rule applies to all tickets matching the trigger</p>}
              {form.conditions.map((cond, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value })}>
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className="px-2 py-1.5 border rounded text-sm bg-background" value={cond.operator} onChange={e => updateCondition(idx, { operator: e.target.value })}>
                    {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Input className="flex-1 h-8" value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })} placeholder="Value" />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCondition(idx)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Actions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAction}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {form.actions.length === 0 && <p className="text-xs text-muted-foreground">No actions - add at least one action</p>}
              {form.actions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <select className="px-2 py-1.5 border rounded text-sm bg-background" value={action.type} onChange={e => updateAction(idx, { type: e.target.value, params: {} })}>
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  {action.type === 'assign_to' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.userId || ''} onChange={e => updateAction(idx, { params: { userId: e.target.value } })}>
                      <option value="">Select tech...</option>
                      {techs.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                    </select>
                  )}
                  {action.type === 'set_priority' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.priority || ''} onChange={e => updateAction(idx, { params: { priority: e.target.value } })}>
                      <option value="">Select...</option>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                    </select>
                  )}
                  {action.type === 'set_status' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.status || ''} onChange={e => updateAction(idx, { params: { status: e.target.value } })}>
                      <option value="">Select...</option>
                      <option value="new">New</option><option value="open">Open</option><option value="pending">Pending</option><option value="waiting_on_customer">Waiting on Customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                    </select>
                  )}
                  {action.type === 'set_queue' && (
                    <select className="px-2 py-1.5 border rounded text-sm bg-background flex-1" value={action.params.queueId || ''} onChange={e => updateAction(idx, { params: { queueId: e.target.value } })}>
                      <option value="">Select queue...</option>
                      {queuesOpts.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  )}
                  {action.type === 'send_notification' && (
                    <Input className="flex-1 h-8" value={action.params.message || ''} onChange={e => updateAction(idx, { params: { message: e.target.value } })} placeholder="Notification message" />
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAction(idx)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={form.isActive} onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.isActive ? 'bg-green-500' : 'bg-input'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete Rule" description="This will delete the workflow rule. This cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} />
    </div>
  );
}
