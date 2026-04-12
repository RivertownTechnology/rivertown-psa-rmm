import { useState } from 'react';
import { BookOpen, Code2, MessageSquare, Send, Check, AlertCircle, Loader2, LifeBuoy, Mail, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function SupportPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Help &amp; Support</h1>
          <p className="text-muted-foreground">Guides, API docs, and direct support.</p>
        </div>
      </div>

      <Tabs defaultValue="knowledge-base">
        <TabsList>
          <TabsTrigger value="knowledge-base">
            <BookOpen className="h-4 w-4 mr-2" />
            Knowledge base
          </TabsTrigger>
          <TabsTrigger value="api-docs">
            <Code2 className="h-4 w-4 mr-2" />
            API docs
          </TabsTrigger>
          <TabsTrigger value="submit-ticket">
            <MessageSquare className="h-4 w-4 mr-2" />
            Submit a ticket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge-base">
          <KnowledgeBase />
        </TabsContent>

        <TabsContent value="api-docs">
          <ApiDocs />
        </TabsContent>

        <TabsContent value="submit-ticket">
          <SubmitTicket />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -------------------- Knowledge Base --------------------

const KB_SECTIONS: { title: string; articles: { title: string; body: React.ReactNode }[] }[] = [
  {
    title: 'Getting started',
    articles: [
      {
        title: 'Creating your first ticket',
        body: (
          <>
            <p>Tickets are the core workflow unit in ForgePSA. Create a ticket from <strong>Tickets → New ticket</strong>, or by sending an email to your configured inbox.</p>
            <p>Each ticket has a customer, a contact, a priority (low/medium/high/critical), and a status. SLA timers start automatically based on your tenant's SLA policy.</p>
          </>
        ),
      },
      {
        title: 'Inviting your team',
        body: (
          <>
            <p>Go to <strong>Settings → Users → Invite</strong>. Enter their email and pick a role:</p>
            <ul className="list-disc pl-6 space-y-1 my-2">
              <li><strong>Owner</strong> — full control, including billing and user management</li>
              <li><strong>Admin</strong> — full access except billing</li>
              <li><strong>Tech</strong> — can work tickets, log time, and view customers; no settings access</li>
            </ul>
            <p>Billable seat counts include owners, admins, and techs. Portal users (your customers) are free.</p>
          </>
        ),
      },
      {
        title: 'Connecting email',
        body: (
          <>
            <p>Email-to-ticket works with Gmail (OAuth) or any SMTP + IMAP provider. Configure under <strong>Settings → Integrations → Email</strong>.</p>
            <p>Customer replies thread automatically back into the original ticket by matching the message-id and the ticket reference in the subject line.</p>
          </>
        ),
      },
    ],
  },
  {
    title: 'Billing',
    articles: [
      {
        title: 'Setting up recurring contracts',
        body: (
          <p>Under <strong>Billing → Contracts → New contract</strong>, pick a customer, choose the billing cadence (monthly/quarterly/annual), and add line items. Contracts auto-generate invoices on their schedule.</p>
        ),
      },
      {
        title: 'Invoice email templates',
        body: (
          <p>Settings → Operations → Templates. You can edit the subject, HTML body, and plain-text fallback for every email ForgePSA sends on your behalf (invoice issued, reminder, receipt, etc.).</p>
        ),
      },
      {
        title: 'Connecting QuickBooks Online',
        body: (
          <p>Settings → Integrations → Accounting → QuickBooks. Click Connect, authorize via Intuit OAuth, and map your QB items to ForgePSA catalog entries. Invoices created in ForgePSA sync to QB as draft invoices; customer creation is bidirectional.</p>
        ),
      },
    ],
  },
  {
    title: 'Customer portal',
    articles: [
      {
        title: 'White-labeling the portal',
        body: (
          <p>Upload your logo under <strong>Settings → Company → Branding</strong>. The portal uses your brand colors and logo automatically. You can also set a custom subdomain (Pro plan and up).</p>
        ),
      },
      {
        title: 'Passkey + SMS MFA',
        body: (
          <p>Portal users can sign in with passkeys (WebAuthn) — no passwords needed. SMS MFA via Twilio is also available as a fallback. Both are configured per-contact by the customer themselves.</p>
        ),
      },
    ],
  },
  {
    title: 'Integrations',
    articles: [
      {
        title: 'Pax8 product sync',
        body: (
          <p>Settings → Integrations → Vendors → Pax8. Enter your API credentials; product sync runs nightly. Costs pull automatically so gross-margin reporting works out of the box.</p>
        ),
      },
      {
        title: 'Stripe payment links',
        body: (
          <p>Every invoice gets a "Pay now" public link backed by Stripe Checkout. Configure your Stripe account under <strong>Settings → Integrations → Payments</strong>.</p>
        ),
      },
      {
        title: 'NinjaRMM device sync',
        body: (
          <p>Settings → Integrations → RMM → NinjaOne. Enter your Ninja API credentials; devices sync into Assets and are linked to the matching customer automatically.</p>
        ),
      },
    ],
  },
];

function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase().trim();

  const filtered = q
    ? KB_SECTIONS.map((s) => ({
        ...s,
        articles: s.articles.filter(
          (a) => a.title.toLowerCase().includes(q) ||
                 String((a.body as any)?.props?.children ?? '').toLowerCase().includes(q),
        ),
      })).filter((s) => s.articles.length > 0)
    : KB_SECTIONS;

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search the knowledge base…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No articles match "{query}". Try <button className="underline" onClick={() => setQuery('')}>clearing the search</button> or submit a ticket.
        </p>
      )}
      {filtered.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.articles.map((article) => (
              <details key={article.title} className="group border-b last:border-0 pb-3">
                <summary className="cursor-pointer font-medium py-2 hover:text-primary">
                  {article.title}
                </summary>
                <div className="prose prose-sm max-w-none text-muted-foreground pt-2 leading-relaxed space-y-2">
                  {article.body}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -------------------- API Docs --------------------

function ApiDocs() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            All API requests authenticate via JWT bearer tokens, obtained by signing in through <code>/api/v1/auth/login</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Every request must include an <code>Authorization</code> header:</p>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs"><code>Authorization: Bearer &lt;access_token&gt;</code></pre>
          <p>
            Access tokens expire after 15 minutes. Use the refresh token endpoint to get a new one:
          </p>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs"><code>{`POST /api/v1/auth/refresh
Content-Type: application/json

{"refreshToken": "<refresh_token>"}`}</code></pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base URL</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs"><code>https://api.forgepsa.com/api/v1</code></pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate limits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>Default: <strong>100 requests per minute</strong> per authenticated user. Specific endpoints have tighter limits:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><code>/auth/login</code> — 5 per 5 minutes per IP</li>
            <li><code>/auth/refresh</code> — 10 per minute per IP</li>
            <li><code>/signup</code> — 3 per hour per IP</li>
          </ul>
          <p>Rate-limited responses return <code>429 Too Many Requests</code> with a <code>Retry-After</code> header.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { method: 'GET', path: '/tickets', desc: 'List tickets with filtering' },
            { method: 'POST', path: '/tickets', desc: 'Create a ticket' },
            { method: 'GET', path: '/tickets/:id', desc: 'Get a single ticket' },
            { method: 'PATCH', path: '/tickets/:id', desc: 'Update a ticket' },
            { method: 'GET', path: '/customers', desc: 'List customers' },
            { method: 'POST', path: '/customers', desc: 'Create a customer' },
            { method: 'GET', path: '/contacts', desc: 'List contacts' },
            { method: 'GET', path: '/invoices', desc: 'List invoices' },
            { method: 'POST', path: '/invoices', desc: 'Create an invoice' },
            { method: 'GET', path: '/contracts', desc: 'List contracts' },
            { method: 'GET', path: '/assets', desc: 'List assets' },
          ].map((row) => (
            <div key={row.path} className="flex items-center gap-3 py-1 border-b last:border-0">
              <span className="inline-block w-14 text-xs font-bold text-primary">{row.method}</span>
              <code className="text-sm">{row.path}</code>
              <span className="text-muted-foreground text-sm ml-auto">{row.desc}</span>
            </div>
          ))}
          <p className="pt-2 text-muted-foreground">
            Full OpenAPI 3.0 spec with request/response schemas and examples is coming soon.
            Need something specific? Submit a ticket.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks <span className="text-muted-foreground text-sm font-normal">(coming soon)</span></CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Outbound webhooks for ticket created/updated, invoice created/paid, and customer created are in development.
            <a href="mailto:support@forgepsa.com" className="text-primary hover:underline ml-1">
              Reach out
            </a>{' '}
            to join the beta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- Submit Ticket --------------------

function SubmitTicket() {
  const { user } = useAuth();
  const [category, setCategory] = useState<'bug' | 'question' | 'feature' | 'billing'>('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: true; id?: string } | { ok: false; error: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await api<{ id?: string }>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ category, subject, body }),
      });
      setResult({ ok: true, id: res.id });
      setSubject('');
      setBody('');
      setCategory('question');
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Could not submit. Email support@forgepsa.com instead.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a ticket</CardTitle>
        <CardDescription>
          Our team replies within one business day. For production-down issues, include "URGENT" in the subject.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                { key: 'question', label: 'Question' },
                { key: 'bug', label: 'Bug report' },
                { key: 'feature', label: 'Feature request' },
                { key: 'billing', label: 'Billing' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCategory(opt.key)}
                  className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    category === opt.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Details</Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened? What did you expect? If this is a bug, include steps to reproduce."
              className="w-full min-h-[160px] px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
              maxLength={10000}
              required
            />
            <p className="text-xs text-muted-foreground">
              We'll include your account details ({user?.email}) automatically — no need to paste them.
            </p>
          </div>

          {result?.ok === true && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-green-50 text-green-800">
              <Check className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Ticket submitted. {result.id && <span>Reference: <code>{result.id}</code>.</span>}{' '}
                We'll reply to <strong>{user?.email}</strong>.
              </span>
            </div>
          )}
          {result && result.ok === false && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          )}

          <Button type="submit" disabled={submitting || !subject.trim() || !body.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit ticket
          </Button>
        </form>

        <div className="border-t mt-8 pt-6 flex items-start gap-3">
          <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm text-muted-foreground">
            Prefer email? Write to{' '}
            <a href="mailto:support@forgepsa.com" className="text-primary hover:underline inline-flex items-center gap-1">
              support@forgepsa.com
              <ExternalLink className="h-3 w-3" />
            </a>
            . Same inbox, same response time.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
