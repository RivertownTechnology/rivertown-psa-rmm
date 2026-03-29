import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessProfile {
  logoBase64: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  invoiceStyle: string;
  quoteStyle: string;
  invoiceFooter: string;
  quoteFooter: string;
  paymentTerms: string;
}

interface EmailTemplate {
  id: string;
  type: string;
  name: string;
  subject: string;
  htmlBody: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const defaultProfile: BusinessProfile = {
  logoBase64: '',
  businessName: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  website: '',
  invoiceStyle: 'modern',
  quoteStyle: 'modern',
  invoiceFooter: '',
  quoteFooter: '',
  paymentTerms: '',
};

// ---------------------------------------------------------------------------
// Variable chips grouped by category
// ---------------------------------------------------------------------------

const variableGroups: Record<string, string[]> = {
  Business: [
    'businessName', 'businessLogo', 'businessAddress', 'businessCity',
    'businessState', 'businessZip', 'businessPhone', 'businessEmail',
  ],
  Ticket: [
    'ticketNumber', 'ticketSubject', 'ticketPriority', 'ticketStatus',
    'ticketDescription', 'customerName',
  ],
  Comment: ['commentBody', 'contactName'],
  Quote: [
    'quoteNumber', 'quoteTitle', 'quoteSummary', 'totalFormatted', 'validUntil',
  ],
  Invoice: [
    'invoiceNumber', 'issueDate', 'dueDate', 'totalFormatted',
    'invoiceNotes', 'lineItemsHtml', 'amountFormatted',
  ],
  Portal: ['portalUrl', 'contactEmail', 'contactName'],
};

// ---------------------------------------------------------------------------
// Style Cards
// ---------------------------------------------------------------------------

const styleOptions = [
  {
    value: 'modern',
    label: 'Modern',
    color: 'bg-blue-600',
    desc: 'Bold blue header with clean layout',
  },
  {
    value: 'classic',
    label: 'Classic',
    color: 'bg-gray-500',
    desc: 'Neutral tones with traditional structure',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    color: 'bg-white border',
    desc: 'Simple white design with light borders',
  },
];

function StyleSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-3">
        {styleOptions.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border-2 p-3 text-left transition-all ${
              value === opt.value
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            <div className={`h-16 rounded-md mb-2 ${opt.color}`} />
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TemplatesSettingsPage() {
  // Business Profile state
  const [profile, setProfile] = useState<BusinessProfile>({ ...defaultProfile });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');

  // Document Styles state (shares the same endpoint)
  const [stylesSaving, setStylesSaving] = useState(false);
  const [stylesSuccess, setStylesSuccess] = useState('');

  // Email Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [seeding, setSeeding] = useState(false);

  // Edit template dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', htmlBody: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    api<BusinessProfile>('/settings/business-profile')
      .then(data => setProfile({ ...defaultProfile, ...data }))
      .catch(() => {});

    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const data = await api<EmailTemplate[]>('/settings/templates');
      setTemplates(data);
    } catch { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Business Profile
  // ---------------------------------------------------------------------------

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfile(p => ({ ...p, logoBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileSuccess('');
    try {
      await api('/settings/business-profile', {
        method: 'PUT',
        body: JSON.stringify({
          logoBase64: profile.logoBase64,
          businessName: profile.businessName,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          zip: profile.zip,
          phone: profile.phone,
          email: profile.email,
          website: profile.website,
        }),
      });
      setProfileSuccess('Business profile saved');
    } catch { /* */ }
    finally { setProfileSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Document Styles
  // ---------------------------------------------------------------------------

  async function saveStyles() {
    setStylesSaving(true);
    setStylesSuccess('');
    try {
      await api('/settings/business-profile', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceStyle: profile.invoiceStyle,
          quoteStyle: profile.quoteStyle,
          invoiceFooter: profile.invoiceFooter,
          quoteFooter: profile.quoteFooter,
          paymentTerms: profile.paymentTerms,
        }),
      });
      setStylesSuccess('Document styles saved');
    } catch { /* */ }
    finally { setStylesSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Email Templates
  // ---------------------------------------------------------------------------

  async function seedDefaults() {
    setSeeding(true);
    try {
      await api('/settings/templates/seed-defaults', { method: 'POST' });
      await loadTemplates();
    } catch { /* */ }
    finally { setSeeding(false); }
  }

  async function toggleActive(tpl: EmailTemplate) {
    try {
      await api(`/settings/templates/${tpl.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !tpl.isActive }),
      });
      setTemplates(prev =>
        prev.map(t => (t.id === tpl.id ? { ...t, isActive: !t.isActive } : t)),
      );
    } catch { /* */ }
  }

  function openEdit(tpl: EmailTemplate) {
    setEditTemplate(tpl);
    setEditForm({ name: tpl.name, subject: tpl.subject, htmlBody: tpl.htmlBody });
    setPreviewHtml('');
    setEditOpen(true);
  }

  function insertVariable(variable: string) {
    const tag = `{{${variable}}}`;
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = editForm.htmlBody.slice(0, start);
      const after = editForm.htmlBody.slice(end);
      const newBody = before + tag + after;
      setEditForm(f => ({ ...f, htmlBody: newBody }));
      // Restore cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      }, 0);
    } else {
      setEditForm(f => ({ ...f, htmlBody: f.htmlBody + tag }));
    }
  }

  async function loadPreview() {
    if (!editTemplate) return;
    try {
      const res = await api<{ html: string }>(`/settings/templates/${editTemplate.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ htmlBody: editForm.htmlBody }),
      });
      setPreviewHtml(res.html);
    } catch {
      setPreviewHtml('<p style="color:red;">Preview failed to load.</p>');
    }
  }

  async function saveTemplate() {
    if (!editTemplate) return;
    setEditSaving(true);
    try {
      await api(`/settings/templates/${editTemplate.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          subject: editForm.subject,
          htmlBody: editForm.htmlBody,
        }),
      });
      setEditOpen(false);
      await loadTemplates();
    } catch { /* */ }
    finally { setEditSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Business Profile moved to Settings > General */}

      {/* Document Styles */}
      <Card>
        <CardHeader>
          <CardTitle>Document Styles</CardTitle>
          <CardDescription>
            Customize the look and feel of your invoices and quotes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {stylesSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">
              {stylesSuccess}
            </div>
          )}

          <StyleSelector
            label="Invoice Style"
            value={profile.invoiceStyle}
            onChange={v => setProfile(p => ({ ...p, invoiceStyle: v }))}
          />

          <StyleSelector
            label="Quote Style"
            value={profile.quoteStyle}
            onChange={v => setProfile(p => ({ ...p, quoteStyle: v }))}
          />

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Footer</Label>
              <Input
                value={profile.invoiceFooter}
                onChange={e => setProfile(p => ({ ...p, invoiceFooter: e.target.value }))}
                placeholder="Thank you for your business!"
              />
            </div>
            <div className="space-y-2">
              <Label>Quote Footer</Label>
              <Input
                value={profile.quoteFooter}
                onChange={e => setProfile(p => ({ ...p, quoteFooter: e.target.value }))}
                placeholder="This quote is valid for 30 days."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Input
              value={profile.paymentTerms}
              onChange={e => setProfile(p => ({ ...p, paymentTerms: e.target.value }))}
              placeholder="Net 30 — payment due within 30 days of issue date."
            />
          </div>

          <Button onClick={saveStyles} disabled={stylesSaving}>
            {stylesSaving ? 'Saving...' : 'Save Document Styles'}
          </Button>
        </CardContent>
      </Card>

      {/* Section 3: Email Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Templates</CardTitle>
              <CardDescription>
                Manage the HTML email templates used for notifications, invoices, and quotes.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={seedDefaults} disabled={seeding}>
              {seeding ? 'Seeding...' : 'Seed Default Templates'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No templates yet. Click "Seed Default Templates" to create starter templates.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Subject</th>
                    <th className="text-center p-3 font-medium">Active</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(tpl => (
                    <tr key={tpl.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {tpl.type}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium">{tpl.name}</td>
                      <td className="p-3 text-muted-foreground max-w-[250px] truncate">
                        {tpl.subject}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleActive(tpl)}
                          className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            tpl.isActive ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              tpl.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => openEdit(tpl)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Template{editTemplate ? `: ${editTemplate.name}` : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name & Subject */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={editForm.subject}
                  onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>
            </div>

            {/* Variable Chips */}
            <div className="space-y-2">
              <Label>Available Variables</Label>
              <p className="text-xs text-muted-foreground">
                Click a variable to insert it at the cursor position in the HTML body.
              </p>
              <div className="space-y-2">
                {Object.entries(variableGroups).map(([group, vars]) => (
                  <div key={group} className="flex flex-wrap items-center gap-1">
                    <span className="text-xs font-semibold text-muted-foreground w-16 shrink-0">
                      {group}
                    </span>
                    {vars.map(v => (
                      <Badge
                        key={v}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                        onClick={() => insertVariable(v)}
                      >
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Body + Preview side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>HTML Body</Label>
                </div>
                <textarea
                  ref={bodyRef}
                  value={editForm.htmlBody}
                  onChange={e => setEditForm(f => ({ ...f, htmlBody: e.target.value }))}
                  rows={20}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
                  placeholder="<html>...</html>"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Preview</Label>
                  <Button variant="outline" size="sm" onClick={loadPreview}>
                    Refresh Preview
                  </Button>
                </div>
                <div className="border rounded-md bg-white p-4 min-h-[300px] overflow-auto text-black">
                  {previewHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-gray-400">
                      Click "Refresh Preview" to see rendered HTML
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
