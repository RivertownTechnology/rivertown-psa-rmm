import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User, Bell, Hash, Mail, Send, CheckCircle, DollarSign, Shield, ShieldAlert, X, Package, Search, Key } from 'lucide-react';
import { BusinessProfileCard } from '@/components/business-profile-card';
import { SecurityPage } from './security';
import { ProductCatalogPage } from './product-catalog';
import { TemplatesSettingsPage } from './templates-settings';
import { NumberStepper } from '@/components/ui/number-stepper';
import { UsersTab } from './settings/users-tab';
import { ApiKeysTab } from './settings/api-keys-tab';
import { BillingSettingsTab } from './settings/billing-settings-tab';
import { AISettingsTab } from './settings/ai-settings-tab';
import { AuditLogTab } from './settings/audit-log-tab';
import { BillingEmailCard } from './settings/billing-email-card';
import { QuickBooksCard } from './settings/quickbooks-card';
import { TwilioCard } from './settings/twilio-card';
import { ApplePushCard } from './settings/apple-push-card';
import { ConnectBoosterCard } from './settings/connectbooster-card';
import { QBOPaymentsCard } from './settings/qbo-payments-card';
import { CrewHuCard } from './settings/crewhu-card';
import { NinjaOneCard } from './settings/ninja-card';
import { ScreenConnectCard } from './settings/screenconnect-card';
import { NCentralCard } from './settings/ncentral-card';
import { StorageCard } from './settings/storage-card';
import { CannedResponsesTab } from './settings/canned-responses-tab';
import { CustomFieldsTab } from './settings/custom-fields-tab';
import { TicketTemplatesTab } from './settings/ticket-templates-tab';
import { CategoriesTab } from './settings/categories-tab';
import { QueuesTab } from './settings/queues-tab';
import { TagsTab } from './settings/tags-tab';
import { RecurringTicketsTab } from './settings/recurring-tickets-tab';
import { WorkflowRulesTab } from './settings/workflow-rules-tab';
import { ReportTemplateTab } from './settings/report-template-tab';

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
  const validTabs = ['account', 'company', 'users', 'api-keys', 'operations', 'tickets', 'catalog', 'integrations', 'audit'];
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
  const resolvedHash = legacyRedirect || (validTabs.includes(rawTopTab) ? (hashRaw || rawTopTab) : 'company');
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
    <div className="max-w-6xl">
      <Tabs value={tab} onValueChange={changeTab} className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
        {!hideTabsList && (
          <TabsList className="flex md:flex-col h-auto w-full md:w-52 shrink-0 items-stretch justify-start gap-0.5 rounded-lg border bg-card p-2 md:sticky md:top-16 overflow-x-auto md:overflow-visible">
            {[
              { label: 'Workspace', items: [
                { value: 'company', label: 'Company' },
                { value: 'users', label: 'Users' },
                { value: 'api-keys', label: 'API Keys' },
                { value: 'audit', label: 'Audit Log' },
              ] },
              { label: 'Ticketing', items: [
                { value: 'tickets', label: 'Tickets' },
                { value: 'operations', label: 'Operations' },
              ] },
              { label: 'Billing', items: [
                { value: 'catalog', label: 'Product Catalog' },
              ] },
              { label: 'Integrations', items: [
                { value: 'integrations', label: 'Integrations & RMM' },
              ] },
            ].map((group) => (
              <div key={group.label} className="contents md:block">
                <div className="hidden md:block px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
                {group.items.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="w-full justify-start whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </div>
            ))}
          </TabsList>
        )}

        <div className="flex-1 min-w-0 w-full">

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

        {/* USERS TAB */}
        <TabsContent value="users">
          <div className="mt-4">
            <UsersTab />
          </div>
        </TabsContent>

        {/* API KEYS TAB */}
        <TabsContent value="api-keys">
          <div className="mt-4">
            <ApiKeysTab />
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
              <ReportTemplateTab />
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
              <div className="text-center py-12 space-y-4">
                <p className="text-muted-foreground">Workflow automation has moved to its own page with an enhanced visual builder.</p>
                <a href="/settings/workflows" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground shadow h-9 px-4 py-2 hover:bg-primary/90">
                  Open Workflow Builder
                </a>
              </div>
            </TabsContent>

          </Tabs>
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations">
          <Tabs value={integrationsSubTab} onValueChange={changeIntegrationsSub} className="mt-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="accounting">Accounting</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="apple-push">Apple Push</TabsTrigger>
              <TabsTrigger value="billing-email">Billing Email</TabsTrigger>
              <TabsTrigger value="email">Email & Inbox</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="rmm">RMM</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="storage">Storage</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>

            {/* CSAT SUB-TAB (CrewHu) */}
            {/* EMAIL & INBOX SUB-TAB */}
            <TabsContent value="email">
              {emailIntegrationsJsx}
            </TabsContent>

            {/* APPLE PUSH SUB-TAB */}
            <TabsContent value="apple-push">
              <div className="space-y-6 mt-4 max-w-2xl">
                <ApplePushCard />
              </div>
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

        </div>
      </Tabs>
    </div>
  );
}
