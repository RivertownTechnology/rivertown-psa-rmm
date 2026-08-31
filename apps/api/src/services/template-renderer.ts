import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Brand logo PNGs shipped with the API (apps/api/src/assets/branding), inlined
// as data URIs so PDFs render without any network fetch.
const brandingAssetCache = new Map<string, string>();
function brandingAsset(filename: string): string {
  const cached = brandingAssetCache.get(filename);
  if (cached !== undefined) return cached;
  let uri = '';
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const buf = readFileSync(path.join(dir, '..', 'assets', 'branding', filename));
    uri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    uri = '';
  }
  brandingAssetCache.set(filename, uri);
  return uri;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  // 1. Process conditional blocks: {{#var}}...{{/var}} — show block if var is truthy
  let result = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, content) => {
    return variables[key] ? content : '';
  });

  // 2. Process inverted blocks: {{^var}}...{{/var}} — show block if var is falsy/empty
  result = result.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, content) => {
    return !variables[key] ? content : '';
  });

  // 3. Replace simple variables: {{var}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? '';
  });

  return result;
}

export function getDefaultTemplates(): Array<{
  templateType: string; name: string; subject: string; bodyHtml: string; bodyText: string;
}> {
  const header = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto">
    <div style="border-bottom:2px solid #2563eb;padding:16px 0;margin-bottom:24px">
      {{#businessLogo}}<img src="{{businessLogo}}" alt="{{businessName}}" style="max-height:48px;margin-bottom:8px"><br>{{/businessLogo}}
      <strong style="font-size:18px;color:#111">{{businessName}}</strong>
    </div>`;
  const footer = `<div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:12px;color:#6b7280">
      <p>{{businessName}}</p>
      <p>{{businessAddress}} {{businessCity}}, {{businessState}} {{businessZip}}</p>
      <p>{{businessPhone}} | {{businessEmail}}</p>
    </div></div>`;

  return [
    {
      templateType: 'ticket_created',
      name: 'Ticket Created',
      subject: '[Ticket #{{ticketNumber}}] {{ticketSubject}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Ticket #{{ticketNumber}} Created</h2>
        <p style="color:#6b7280;margin:0 0 16px">A new ticket has been created.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:120px">Subject</td><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>{{ticketSubject}}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Priority</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">{{ticketPriority}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Customer</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">{{customerName}}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Status</td><td style="padding:8px">{{ticketStatus}}</td></tr>
        </table>
        <p style="margin:16px 0">{{ticketDescription}}</p>
      ${footer}`,
      bodyText: 'Ticket #{{ticketNumber}} - {{ticketSubject}}\nPriority: {{ticketPriority}}\nCustomer: {{customerName}}\n\n{{ticketDescription}}',
    },
    {
      templateType: 'ticket_updated',
      name: 'Ticket Updated',
      subject: '[Ticket #{{ticketNumber}}] Status changed to {{ticketStatus}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Ticket #{{ticketNumber}} Updated</h2>
        <p>The status of your ticket <strong>{{ticketSubject}}</strong> has been changed to <strong>{{ticketStatus}}</strong>.</p>
      ${footer}`,
      bodyText: 'Ticket #{{ticketNumber}} - {{ticketSubject}}\nStatus changed to: {{ticketStatus}}',
    },
    {
      templateType: 'ticket_reply',
      name: 'Ticket Reply',
      subject: 'Re: [Ticket #{{ticketNumber}}] {{ticketSubject}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">New Reply on Ticket #{{ticketNumber}}</h2>
        <p style="color:#6b7280;margin:0 0 16px">{{ticketSubject}}</p>
        <div style="background:#f9fafb;border-left:3px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0">
          {{commentBody}}
        </div>
        <p style="font-size:13px;color:#6b7280">Reply to this email to add a comment to the ticket.</p>
      ${footer}`,
      bodyText: 'New reply on Ticket #{{ticketNumber}} - {{ticketSubject}}\n\n{{commentBody}}\n\nReply to this email to respond.',
    },
    {
      templateType: 'ticket_closed',
      name: 'Ticket Closed',
      subject: '[Ticket #{{ticketNumber}}] Resolved: {{ticketSubject}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Ticket #{{ticketNumber}} Resolved</h2>
        <p>Your ticket <strong>{{ticketSubject}}</strong> has been resolved.</p>
        <p style="margin:16px 0;color:#6b7280">If you still need assistance, simply reply to this email to reopen the ticket.</p>
      ${footer}`,
      bodyText: 'Ticket #{{ticketNumber}} - {{ticketSubject}} has been resolved.\n\nReply to this email to reopen.',
    },
    {
      templateType: 'quote_sent',
      name: 'Quote Sent',
      subject: 'Quote #{{quoteNumber}}: {{quoteTitle}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Quote #{{quoteNumber}}</h2>
        <p style="margin:0 0 16px"><strong>{{quoteTitle}}</strong></p>
        <table style="width:100%;margin:16px 0" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;width:50%;padding-right:16px">
            <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">From</div>
            <div style="font-weight:600">{{businessName}}</div>
            <div style="color:#6b7280;font-size:13px">{{businessAddress}}<br>{{businessCity}}, {{businessState}} {{businessZip}}<br>{{businessPhone}}<br>{{businessEmail}}</div>
          </td>
          <td style="vertical-align:top;width:50%;text-align:right">
            <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">Prepared For</div>
            <div style="font-weight:600">{{billToName}}</div>
            <div style="color:#6b7280;font-size:13px">{{billToCompany}}<br>{{billToAddress}}<br>{{billToCity}}, {{billToState}} {{billToZip}}</div>
          </td>
        </tr></table>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;text-align:center;margin:16px 0">
          <div style="font-size:36px;font-weight:bold;color:#16a34a">\${{totalFormatted}}</div>
          <div style="color:#6b7280;margin-top:4px">Valid until {{validUntil}}</div>
        </div>
        {{#quoteSummary}}<p style="margin:16px 0">{{quoteSummary}}</p>{{/quoteSummary}}
        {{#approveQuoteUrl}}<div style="text-align:center;margin:28px 0">
          <a href="{{approveQuoteUrl}}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Review &amp; Approve Quote</a>
        </div>{{/approveQuoteUrl}}
        <p style="margin:16px 0;color:#6b7280;font-size:13px">A PDF copy of this quote is attached. Reply to this email with any questions{{^approveQuoteUrl}} or to approve this quote{{/approveQuoteUrl}}.</p>
      ${footer}`,
      bodyText: 'Quote #{{quoteNumber}}: {{quoteTitle}}\nTotal: ${{totalFormatted}}\nValid until: {{validUntil}}\n\n{{quoteSummary}}\n\nReview & approve: {{approveQuoteUrl}}',
    },
    {
      templateType: 'msa_sent',
      name: 'Agreement Sent',
      subject: '{{agreementTitle}} — signature requested',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">{{agreementTitle}}</h2>
        <p>Hi {{customerName}},</p>
        <p>Thank you for approving Quote #{{quoteNumber}}! The next step is to sign your service agreement — a simple month-to-month agreement with no long-term commitment.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="{{signAgreementUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Review &amp; Sign Agreement</a>
        </div>
        <p style="margin:16px 0;color:#6b7280;font-size:13px">Signing takes less than a minute — just review the agreement and type your name.</p>
      ${footer}`,
      bodyText: '{{agreementTitle}}\n\nThank you for approving Quote #{{quoteNumber}}. Please review and sign your month-to-month service agreement:\n{{signAgreementUrl}}',
    },
    {
      templateType: 'msa_signed',
      name: 'Agreement Signed',
      subject: 'Signed copy of your {{agreementTitle}}',
      bodyHtml: `${header}
        <div style="text-align:center;margin:16px 0">
          <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;color:#16a34a">&#10003;</div>
        </div>
        <h2 style="color:#16a34a;margin:0 0 8px;text-align:center">Agreement Signed</h2>
        <p style="text-align:center">Welcome aboard, {{customerName}}!</p>
        <p style="text-align:center;color:#6b7280">A signed copy of your {{agreementTitle}} is attached to this email for your records. We're excited to get started.</p>
      ${footer}`,
      bodyText: 'Your {{agreementTitle}} has been signed. A copy is attached for your records. Welcome aboard!',
    },
    {
      templateType: 'invoice_sent',
      name: 'Invoice Sent',
      subject: 'Invoice #{{invoiceNumber}} — ${{totalFormatted}} due {{dueDate}}',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Invoice #{{invoiceNumber}}</h2>
        <table style="width:100%;margin:16px 0" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;width:50%;padding-right:16px">
            <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">From</div>
            <div style="font-weight:600">{{businessName}}</div>
            <div style="color:#6b7280;font-size:13px">{{businessAddress}}<br>{{businessCity}}, {{businessState}} {{businessZip}}<br>{{businessPhone}}<br>{{businessEmail}}</div>
          </td>
          <td style="vertical-align:top;width:50%;text-align:right">
            <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">Bill To</div>
            <div style="font-weight:600">{{billToName}}</div>
            <div style="color:#6b7280;font-size:13px">{{billToCompany}}<br>{{billToAddress}}<br>{{billToCity}}, {{billToState}} {{billToZip}}</div>
          </td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
          <tr><td style="padding:12px 16px;color:#6b7280">Issue Date</td><td style="padding:12px 16px;text-align:right">{{issueDate}}</td></tr>
          <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Due Date</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e5e7eb"><strong>{{dueDate}}</strong></td></tr>
          <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Amount Due</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e5e7eb;font-size:24px;font-weight:bold;color:#111">\${{totalFormatted}}</td></tr>
        </table>
        {{lineItemsHtml}}
        {{#invoiceNotes}}<p style="margin:16px 0;color:#6b7280">{{invoiceNotes}}</p>{{/invoiceNotes}}
        {{#invoicePaymentTerms}}<p style="color:#6b7280;font-size:13px">{{invoicePaymentTerms}}</p>{{/invoicePaymentTerms}}
        <div style="text-align:center;margin:28px 0">
          {{#payInvoiceUrl}}<a href="{{payInvoiceUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;margin:0 8px">Pay Now — \${{balanceFormatted}}</a>{{/payInvoiceUrl}}
          {{#viewInvoiceUrl}}<a href="{{viewInvoiceUrl}}" style="display:inline-block;background:#ffffff;color:#2563eb;border:2px solid #2563eb;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin:0 8px">View Invoice</a>{{/viewInvoiceUrl}}
        </div>
        {{#viewInvoiceUrl}}<p style="text-align:center;color:#9ca3af;font-size:12px;margin:8px 0 0">This link expires in 30 days. You can print or save as PDF from the online view.</p>{{/viewInvoiceUrl}}
      ${footer}`,
      bodyText: 'Invoice #{{invoiceNumber}}\nAmount: ${{totalFormatted}}\nDue: {{dueDate}}\n\nView Invoice: {{viewInvoiceUrl}}\nPay Now: {{payInvoiceUrl}}\n\n{{invoiceNotes}}',
    },
    {
      templateType: 'invoice_paid',
      name: 'Invoice Paid',
      subject: 'Payment received — Invoice #{{invoiceNumber}}',
      bodyHtml: `${header}
        <div style="text-align:center;margin:16px 0">
          <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;color:#16a34a">&#10003;</div>
        </div>
        <h2 style="color:#16a34a;margin:0 0 8px;text-align:center">Payment Received</h2>
        <p style="text-align:center;margin:0 0 16px">Thank you for your payment!</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
          <tr><td style="padding:12px 16px;color:#6b7280">Invoice</td><td style="padding:12px 16px;text-align:right;font-weight:600">#{{invoiceNumber}}</td></tr>
          <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Amount Paid</td><td style="padding:12px 16px;text-align:right;font-size:24px;font-weight:bold;color:#16a34a;border-top:1px solid #e5e7eb">\${{amountFormatted}}</td></tr>
          <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Customer</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e5e7eb">{{customerName}}</td></tr>
        </table>
        <p style="text-align:center;color:#6b7280;font-size:13px;margin:16px 0">No further action is required. This email serves as your receipt.</p>
      ${footer}`,
      bodyText: 'Payment of ${{amountFormatted}} received for Invoice #{{invoiceNumber}}. Thank you!',
    },
    {
      templateType: 'portal_welcome',
      name: 'Portal Welcome',
      subject: 'Welcome to the {{businessName}} Customer Portal',
      bodyHtml: `${header}
        <h2 style="color:#111;margin:0 0 8px">Welcome to Your Customer Portal</h2>
        <p>Hi {{contactName}},</p>
        <p>Your customer portal account has been created. You can now submit and track support tickets, view invoices, and manage your account.</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px;font-weight:600">Your login credentials:</p>
          <p style="margin:0 0 4px">Portal: <a href="{{portalUrl}}" style="color:#2563eb">{{portalUrl}}</a></p>
          <p style="margin:0 0 4px">Email: <strong>{{contactEmail}}</strong></p>
          <p style="margin:0">Temporary password: <code style="background:#e5e7eb;padding:2px 8px;border-radius:4px;font-size:14px">{{tempPassword}}</code></p>
        </div>
        <p style="color:#dc2626;font-size:13px;font-weight:500">You will be required to change your password on first login.</p>
      ${footer}`,
      bodyText: 'Welcome to the {{businessName}} Customer Portal!\n\nPortal: {{portalUrl}}\nEmail: {{contactEmail}}\nTemporary Password: {{tempPassword}}\n\nYou will be required to change your password on first login.',
    },
  ];
}

// Generate invoice HTML for PDF/print
export function generateInvoiceHtml(data: {
  businessName: string; businessAddress: string; businessCity: string; businessState: string; businessZip: string;
  businessPhone: string; businessEmail: string; businessLogo: string; businessWebsite: string;
  customerName: string; customerAddress?: string; customerCity?: string; customerState?: string;
  customerZip?: string; customerEmail?: string; customerPhone?: string;
  invoiceNumber: number; issueDate: string; dueDate: string; notes: string;
  lineItems: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string; tax: string; total: string; paid: string; balance: string;
  style: string; footer: string; paymentTerms: string;
}): string {
  const d = data;
  const isModern = d.style === 'modern';
  const isClassic = d.style === 'classic';

  const primaryColor = isModern ? '#2563eb' : isClassic ? '#1a1a1a' : '#374151';

  const rows = d.lineItems.map(li => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(li.description)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(li.quantity)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(li.unitPrice)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${escapeHtml(li.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice #${d.invoiceNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:system-ui,-apple-system,sans-serif; color:#374151; font-size:14px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .page { max-width:800px; margin:0 auto; padding:40px; }
  table { width:100%; border-collapse:collapse; }
</style></head>
<body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-top:4px solid ${primaryColor};border-radius:8px">
    <div>
      ${d.businessLogo ? `<img src="${d.businessLogo}" style="max-height:60px;margin-bottom:8px"><br>` : ''}
      <div style="font-size:20px;font-weight:700;color:#111111">${d.businessName}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">
        ${d.businessAddress ? `${d.businessAddress}<br>` : ''}${[d.businessCity, d.businessState].filter(Boolean).join(', ')}${d.businessZip ? ` ${d.businessZip}` : ''}${(d.businessPhone || d.businessEmail) ? '<br>' : ''}${[d.businessPhone, d.businessEmail].filter(Boolean).join(' | ')}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:700;color:${primaryColor}">INVOICE</div>
      <div style="font-size:16px;color:#6b7280">#${d.invoiceNumber}</div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:32px">
    <div>
      <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">Bill To</div>
      <div style="font-weight:600;font-size:16px">${d.customerName}</div>
      ${d.customerAddress ? `<div style="color:#6b7280">${d.customerAddress}</div>` : ''}${[d.customerCity, d.customerState].filter(Boolean).join(', ')}${d.customerZip ? ` ${d.customerZip}` : ''}${(d.customerCity || d.customerState || d.customerZip) ? '<br>' : ''}${[d.customerEmail, d.customerPhone].filter(Boolean).length ? `<div style="color:#6b7280;margin-top:4px">${[d.customerEmail, d.customerPhone].filter(Boolean).join(' | ')}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="margin-bottom:8px"><span style="color:#9ca3af">Issue Date:</span> <strong>${d.issueDate}</strong></div>
      <div style="margin-bottom:8px"><span style="color:#9ca3af">Due Date:</span> <strong>${d.dueDate}</strong></div>
      <div style="font-size:20px;font-weight:700;color:${primaryColor}">$${d.balance} due</div>
    </div>
  </div>

  <table style="margin-bottom:24px">
    <thead><tr style="background:#f9fafb">
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Description</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Unit Price</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <div style="width:250px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Subtotal</span><span>$${d.subtotal}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Tax</span><span>$${d.tax}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid ${primaryColor};font-size:16px;font-weight:700"><span>Total</span><span>$${d.total}</span></div>
      ${parseFloat(d.paid) > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0"><span style="color:#6b7280">Paid</span><span style="color:#16a34a">-$${d.paid}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:18px;color:${primaryColor}"><span>Balance Due</span><span>$${d.balance}</span></div>` : ''}
    </div>
  </div>

  ${d.notes ? `<div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:16px"><div style="font-size:11px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Notes</div><div>${escapeHtml(d.notes)}</div></div>` : ''}
  ${d.paymentTerms ? `<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">${escapeHtml(d.paymentTerms)}</div>` : ''}
  ${d.footer ? `<div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">${escapeHtml(d.footer)}</div>` : ''}
</div></body></html>`;
}

// Public invoice view page — wraps invoice HTML with action buttons
export function generateInvoiceViewPage(data: {
  invoiceHtml: string;
  invoiceNumber: number;
  balanceCents: number;
  isPaid: boolean;
  payUrl: string;
  expiresAt: string;
  businessName: string;
  paymentResult?: 'success' | 'cancelled' | null;
}): string {
  const d = data;
  const balance = (d.balanceCents / 100).toFixed(2);

  const successBanner = d.paymentResult === 'success' ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:16px 24px;text-align:center;font-weight:600;font-size:16px">
      Payment received — thank you!
    </div>` : '';

  const cancelledBanner = d.paymentResult === 'cancelled' ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:16px 24px;text-align:center">
      Payment was cancelled. You can try again using the button below.
    </div>` : '';

  const payButton = (!d.isPaid && d.balanceCents > 0 && d.payUrl) ? `
    <a href="${d.payUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
      Pay Now — $${balance}
    </a>` : '';

  const paidBadge = d.isPaid ? `
    <span style="display:inline-block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:8px 20px;border-radius:6px;font-weight:600;font-size:15px">
      Paid in Full
    </span>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice #${d.invoiceNumber} — ${d.businessName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:system-ui,-apple-system,sans-serif; background:#f3f4f6; color:#374151; }
  .action-bar { background:#ffffff; border-bottom:1px solid #e5e7eb; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; position:sticky; top:0; z-index:10; }
  .action-bar .actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .print-btn { display:inline-block; background:#ffffff; color:#374151; border:1px solid #d1d5db; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600; font-size:15px; cursor:pointer; }
  .print-btn:hover { background:#f9fafb; }
  .invoice-container { max-width:880px; margin:24px auto; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.1); border-radius:8px; overflow:hidden; }
  .invoice-container .page { padding:40px; }
  .footer-note { text-align:center; padding:24px; color:#9ca3af; font-size:13px; }
  @media print {
    .action-bar, .footer-note { display:none !important; }
    body { background:#ffffff; }
    .invoice-container { box-shadow:none; margin:0; border-radius:0; }
  }
  @media (max-width:640px) {
    .action-bar { padding:12px 16px; }
    .invoice-container .page { padding:20px; }
  }
</style></head>
<body>
  ${successBanner}${cancelledBanner}
  <div class="action-bar">
    <div style="font-weight:600;color:#111">Invoice #${d.invoiceNumber}</div>
    <div class="actions">
      ${payButton}${paidBadge}
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
  <div class="invoice-container">
    ${d.invoiceHtml}
  </div>
  <div class="footer-note">
    This link expires on ${d.expiresAt}. For questions, contact ${d.businessName}.
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// "Broadsheet" quote document (design handoff: Rivertown Technology Sales Docs)
// Newsprint-style: serif type on paper white, thick-thin rails, no boxes.
// ---------------------------------------------------------------------------

const BS = {
  bg: '#f3f2f2',
  text: '#201e1d',
  accent700: '#006786',
  accent2_700: '#aa0b56',
  neutral700: '#605d5d',
  neutral500: '#9b9797',
  font: `"Source Serif 4", Georgia, "Times New Roman", serif`,
};

const BS_FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">`;

function bsTopRail(left: string, right: string): string {
  return `<div style="border-top:3px solid ${BS.text};border-bottom:1px solid ${BS.text};display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase">
    <span>${left}</span><span>${right}</span>
  </div>`;
}

function bsBottomRail(phone: string, emailLine: string, rightNote: string): string {
  return `<div style="border-top:1px solid ${BS.text};border-bottom:3px solid ${BS.text};padding:12px 0 10px;display:flex;justify-content:space-between;align-items:baseline">
    <div style="font-size:20px;font-weight:600">${phone} <span style="font-weight:400;font-size:13px;color:${BS.neutral700}">· ${emailLine}</span></div>
    <div style="font-size:12px;color:${BS.neutral700}">${rightNote}</div>
  </div>`;
}

export interface QuoteSignatureBlock {
  signerName: string;
  ipAddress: string;
  signedAt: string; // pre-formatted UTC timestamp
}

function bsSignatureCertificate(sig: QuoteSignatureBlock, docRef: string): string {
  return `<section style="margin-top:8px">
    <div style="font-size:11.5px;letter-spacing:0.14em;text-transform:uppercase;color:${BS.accent700};margin-bottom:10px">Electronically Signed</div>
    <div style="font-size:26px;font-weight:600;font-style:italic;margin-bottom:6px">${escapeHtml(sig.signerName)}</div>
    <div style="font-size:12px;line-height:1.7;color:${BS.neutral700}">
      Signed electronically by typed-name signature · ${escapeHtml(sig.signedAt)}<br>
      IP address (as reported): ${escapeHtml(sig.ipAddress)} · Document: ${escapeHtml(docRef)}
    </div>
  </section>`;
}

export function generateQuoteHtml(data: {
  businessName: string; businessAddress: string; businessCity: string; businessState: string; businessZip: string;
  businessPhone: string; businessEmail: string; businessLogo: string; businessWebsite?: string;
  customerName: string; customerAddress?: string; customerCity?: string; customerState?: string;
  customerZip?: string; customerEmail?: string; customerPhone?: string;
  quoteNumber: number; title: string; validUntil: string; summary: string; issuedDate?: string;
  lineItems: Array<{ description: string; itemType?: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string; tax: string; total: string;
  style: string; footer: string;
  salesEmail?: string;
  signature?: QuoteSignatureBlock;
}): string {
  const d = data;
  const year = new Date().getFullYear();
  const quoteRef = `Q-${year}-${String(d.quoteNumber).padStart(3, '0')}`;
  const phone = escapeHtml(d.businessPhone || '(843) 410-3982');
  const email = escapeHtml(d.salesEmail || d.businessEmail || 'sales@rivertowntechnology.com');
  const website = escapeHtml((d.businessWebsite || 'rivertowntechnology.com').replace(/^https?:\/\//, ''));
  const businessName = escapeHtml(d.businessName || 'Rivertown Technology');
  const customerName = escapeHtml(d.customerName);
  const issued = escapeHtml(d.issuedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const validUntil = escapeHtml(d.validUntil);
  const location = [d.businessCity, d.businessState].filter(Boolean).map(escapeHtml).join(', ') || 'Conway, South Carolina';

  const stackedLogo = brandingAsset('Large_transparent_background_1.png');
  const shieldLogo = brandingAsset('Small_icon_transparent_background.png');

  const rows = d.lineItems.map(li => `
    <tr>
      <td style="padding:10px 10px 10px 0;border-bottom:1px solid ${BS.neutral500}40;vertical-align:top">
        <strong style="font-weight:600">${escapeHtml(li.description)}</strong>
        ${li.itemType ? `<br><span style="font-size:11.5px;color:${BS.neutral500};text-transform:capitalize">${escapeHtml(li.itemType.replace(/_/g, ' '))}</span>` : ''}
      </td>
      <td style="padding:10px;border-bottom:1px solid ${BS.neutral500}40;text-align:center;white-space:nowrap;vertical-align:top">${escapeHtml(li.quantity)}</td>
      <td style="padding:10px;border-bottom:1px solid ${BS.neutral500}40;text-align:right;white-space:nowrap;vertical-align:top">$${escapeHtml(li.unitPrice)}</td>
      <td style="padding:10px 0 10px 10px;border-bottom:1px solid ${BS.neutral500}40;text-align:right;white-space:nowrap;vertical-align:top">$${escapeHtml(li.total)}</td>
    </tr>`).join('');

  const showTax = parseFloat(d.tax) > 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quote ${quoteRef}</title>
${BS_FONT_LINK}
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size: letter; margin: 0; }
  html, body { background:${BS.bg}; }
  body { font-family:${BS.font}; color:${BS.text}; font-size:14px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  h1, h2 { font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  .cover { width:8.5in; height:11in; padding:0.7in 0.68in 0.6in; display:flex; flex-direction:column; page-break-after:always; }
  .quote-page { width:8.5in; min-height:11in; padding:0.6in 0.68in 0.55in; display:flex; flex-direction:column; gap:24px; }
</style></head>
<body>
<section class="cover">
  ${bsTopRail(`Veteran-Owned · ${location}`, 'Service Quote')}
  ${stackedLogo
    ? `<img src="${stackedLogo}" alt="${businessName}" style="width:280px;height:auto;align-self:flex-start;margin:90px 0 0">`
    : `<div style="font-size:44px;font-weight:600;margin:90px 0 0">${businessName}</div>`}
  <div style="margin-top:70px">
    <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${BS.accent700};margin-bottom:12px">Managed IT Services Quote</div>
    <h1 style="font-size:40px;font-weight:600;line-height:1.15;margin:0 0 18px">Prepared for<br>${customerName}</h1>
    <div style="font-size:14px;line-height:1.8;color:${BS.neutral700}">
      <div>Quote no. <strong style="color:${BS.text}">${quoteRef}</strong></div>
      <div>Issued <strong style="color:${BS.text}">${issued}</strong>${validUntil ? ` · Valid through <strong style="color:${BS.text}">${validUntil}</strong>` : ''}</div>
      <div>Prepared by ${businessName}</div>
    </div>
  </div>
  <footer style="margin-top:auto">
    <div style="border-top:1px solid ${BS.text};border-bottom:3px solid ${BS.text};padding:14px 0 12px;display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:22px;font-weight:600">${phone}</div>
      <div style="font-size:13px;color:${BS.neutral700}">${email} · ${website}</div>
    </div>
  </footer>
</section>
<section class="quote-page">
  <header>
    ${bsTopRail(`${businessName} · Quote ${quoteRef}`, customerName)}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:12px">
      <div>
        <h2 style="font-size:28px;font-weight:600;margin:0 0 4px">Your monthly investment</h2>
        <p style="font-size:13.5px;margin:0;color:${BS.neutral700}">${escapeHtml(d.summary || d.title || 'Flat-rate managed IT. No surprise bills — billable extras are disclosed upfront.')}</p>
      </div>
      ${shieldLogo ? `<img src="${shieldLogo}" alt="" style="height:48px;width:auto;flex:none">` : ''}
    </div>
  </header>
  <section>
    <table style="font-size:13.5px">
      <thead>
        <tr>
          <th style="text-align:left;padding:0 10px 8px 0;border-bottom:1px solid ${BS.text};font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Service</th>
          <th style="text-align:center;padding:0 10px 8px;border-bottom:1px solid ${BS.text};font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Qty</th>
          <th style="text-align:right;padding:0 10px 8px;border-bottom:1px solid ${BS.text};font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Unit</th>
          <th style="text-align:right;padding:0 0 8px 10px;border-bottom:1px solid ${BS.text};font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <div style="text-align:right">
        ${showTax ? `<div style="font-size:13px;color:${BS.neutral700};margin-bottom:6px">Subtotal $${escapeHtml(d.subtotal)} · Tax $${escapeHtml(d.tax)}</div>` : ''}
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BS.neutral500}">Total investment</div>
        <div style="font-size:38px;font-weight:600;color:${BS.accent700}">$${escapeHtml(d.total)}</div>
      </div>
    </div>
  </section>
  <section>
    <div style="font-size:11.5px;letter-spacing:0.14em;text-transform:uppercase;color:${BS.accent700};margin-bottom:10px">Terms</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.7;color:${BS.neutral700}">
      ${d.footer ? d.footer.split(/\r?\n/).filter(l => l.trim()).map(l => `<li>${escapeHtml(l.trim())}</li>`).join('') : ''}
      ${validUntil ? `<li>Quote valid through ${validUntil}.</li>` : ''}
    </ul>
  </section>
  ${d.signature ? bsSignatureCertificate(d.signature, `Quote ${quoteRef}`) : ''}
  <footer style="margin-top:auto">
    ${bsBottomRail(phone, email, d.signature ? `Signed &amp; accepted — welcome aboard.` : 'Ready to start? Use the link in your email to accept this quote.')}
  </footer>
</section>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Public e-signature pages (quote approval + MSA signing)
// ---------------------------------------------------------------------------

export type SignPageState = 'active' | 'signed' | 'declined' | 'expired' | 'revoked';

function signStatusPage(businessName: string, heading: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)} — ${escapeHtml(businessName)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#374151;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:40px;max-width:480px;text-align:center}</style></head>
<body><div class="card"><h1 style="font-size:22px;color:#111;margin:0 0 12px">${escapeHtml(heading)}</h1>
<p style="margin:0;line-height:1.6">${escapeHtml(message)}</p></div></body></html>`;
}

export function generateSignPage(data: {
  state: SignPageState;
  docLabel: string;          // e.g. "Quote Q-2026-004" or "Master Service Agreement"
  docHtml: string;           // rendered document body to embed
  businessName: string;
  signEndpoint: string;      // absolute URL for POST sign
  declineEndpoint: string;   // absolute URL for POST decline
  signedName?: string;       // when state === 'signed'
  successMessage: string;    // shown after successful signing
}): string {
  const d = data;
  if (d.state === 'expired') {
    return signStatusPage(d.businessName, 'Link Expired', `This link for ${d.docLabel} has expired. Please contact ${d.businessName} to request a new one.`);
  }
  if (d.state === 'revoked') {
    return signStatusPage(d.businessName, 'Link No Longer Valid', `A newer version of ${d.docLabel} has been sent. Please use the link in the most recent email from ${d.businessName}.`);
  }
  if (d.state === 'declined') {
    return signStatusPage(d.businessName, 'Declined', `${d.docLabel} was declined. If this was a mistake, please contact ${d.businessName}.`);
  }

  const alreadySigned = d.state === 'signed';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(d.docLabel)} — ${escapeHtml(d.businessName)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:system-ui,-apple-system,sans-serif; background:#e5e7eb; color:#374151; margin:0; }
  .action-bar { background:#ffffff; border-bottom:1px solid #d1d5db; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; position:sticky; top:0; z-index:10; }
  .doc-container { max-width:880px; margin:24px auto 0; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.1); overflow:auto; }
  .sign-panel { max-width:880px; margin:24px auto; background:#ffffff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); padding:32px; }
  .sign-panel h2 { margin:0 0 8px; font-size:20px; color:#111; }
  .sign-panel label { display:block; font-size:13px; font-weight:600; margin:16px 0 4px; color:#374151; }
  .sign-panel input[type=text], .sign-panel input[type=email], .sign-panel textarea { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:15px; font-family:inherit; }
  .agree-row { display:flex; gap:10px; align-items:flex-start; margin:16px 0; font-size:13px; line-height:1.5; }
  .btn-approve { background:#16a34a; color:#fff; border:none; padding:14px 40px; border-radius:6px; font-weight:600; font-size:16px; cursor:pointer; }
  .btn-approve:disabled { background:#9ca3af; cursor:not-allowed; }
  .btn-decline { background:none; border:none; color:#6b7280; text-decoration:underline; font-size:13px; cursor:pointer; padding:8px; }
  .decline-box { display:none; margin-top:12px; }
  .decline-box.open { display:block; }
  .btn-decline-confirm { background:#dc2626; color:#fff; border:none; padding:10px 24px; border-radius:6px; font-weight:600; font-size:14px; cursor:pointer; margin-top:8px; }
  .error-msg { color:#dc2626; font-size:14px; margin-top:12px; display:none; }
  .footer-note { text-align:center; padding:24px; color:#9ca3af; font-size:13px; }
  @media (max-width:640px) { .sign-panel { padding:20px; margin:16px 12px; } .doc-container { margin:16px 12px 0; } }
</style></head>
<body>
  <div class="action-bar">
    <div style="font-weight:600;color:#111">${escapeHtml(d.docLabel)}</div>
    <div style="font-size:13px;color:#6b7280">${escapeHtml(d.businessName)}</div>
  </div>
  <div class="doc-container">${d.docHtml}</div>
  <div class="sign-panel" id="signPanel">
    ${alreadySigned ? `
    <h2>Already Signed</h2>
    <p style="margin:0;color:#16a34a;font-weight:600">This document was signed${d.signedName ? ` by ${escapeHtml(d.signedName)}` : ''}. No further action is needed.</p>
    ` : `
    <h2>Review &amp; Approve</h2>
    <p style="margin:0;color:#6b7280;font-size:14px">Type your full legal name below to electronically sign and accept.</p>
    <form id="signForm">
      <label for="signerName">Full name *</label>
      <input type="text" id="signerName" name="signerName" required minlength="2" maxlength="200" autocomplete="name" placeholder="Jane Q. Smith">
      <label for="signerEmail">Email (optional)</label>
      <input type="email" id="signerEmail" name="signerEmail" autocomplete="email" placeholder="you@company.com">
      <div class="agree-row">
        <input type="checkbox" id="agree" required style="margin-top:2px">
        <label for="agree" style="margin:0;font-weight:400">I agree that typing my name above and clicking &quot;Approve &amp; Sign&quot; constitutes a legal electronic signature, and that I accept the terms of this document. My IP address and the date and time of signing will be recorded.</label>
      </div>
      <button type="submit" class="btn-approve" id="approveBtn">Approve &amp; Sign</button>
      <div><button type="button" class="btn-decline" id="declineToggle">I would like to decline instead</button></div>
      <div class="decline-box" id="declineBox">
        <label for="declineReason">Reason (optional)</label>
        <textarea id="declineReason" rows="3" maxlength="2000" placeholder="Let us know why so we can follow up."></textarea>
        <br><button type="button" class="btn-decline-confirm" id="declineBtn">Decline</button>
      </div>
      <div class="error-msg" id="errorMsg"></div>
    </form>
    `}
  </div>
  <div class="footer-note">Questions? Contact ${escapeHtml(d.businessName)}.</div>
  <script>
  (function() {
    var form = document.getElementById('signForm');
    if (!form) return;
    var panel = document.getElementById('signPanel');
    var errEl = document.getElementById('errorMsg');
    function showError(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
    function done(html) { panel.innerHTML = html; panel.scrollIntoView({ behavior: 'smooth' }); }
    document.getElementById('declineToggle').addEventListener('click', function() {
      document.getElementById('declineBox').classList.toggle('open');
    });
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      errEl.style.display = 'none';
      var btn = document.getElementById('approveBtn');
      btn.disabled = true; btn.textContent = 'Signing…';
      fetch(${JSON.stringify(d.signEndpoint)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: document.getElementById('signerName').value.trim(),
          signerEmail: document.getElementById('signerEmail').value.trim() || undefined,
          agree: true,
        }),
      }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
        .then(function(res) {
          if (res.ok) {
            done('<h2 style="color:#16a34a">Signed — thank you!</h2><p style="line-height:1.6">' + ${JSON.stringify(escapeHtml(data.successMessage))} + '</p>');
          } else {
            btn.disabled = false; btn.textContent = 'Approve & Sign';
            showError((res.body && (res.body.message || res.body.error)) || 'Something went wrong. Please try again.');
          }
        }).catch(function() {
          btn.disabled = false; btn.textContent = 'Approve & Sign';
          showError('Network error. Please try again.');
        });
    });
    document.getElementById('declineBtn').addEventListener('click', function() {
      var btn = document.getElementById('declineBtn');
      btn.disabled = true;
      fetch(${JSON.stringify(d.declineEndpoint)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: document.getElementById('declineReason').value.trim() || undefined }),
      }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
        .then(function(res) {
          if (res.ok) {
            done('<h2>Declined</h2><p style="line-height:1.6">Thanks for letting us know. We may reach out to see how we can adjust the proposal.</p>');
          } else {
            btn.disabled = false;
            showError((res.body && (res.body.message || res.body.error)) || 'Something went wrong. Please try again.');
          }
        }).catch(function() { btn.disabled = false; showError('Network error. Please try again.'); });
    });
  })();
  </script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Agreements (MSA) — PDF document + default template
// ---------------------------------------------------------------------------

export function generateAgreementPdfHtml(data: {
  title: string;
  contentHtml: string;       // trusted, admin-authored template rendered with escaped merge values
  businessName: string; businessPhone: string; businessEmail: string;
  businessCity?: string; businessState?: string;
  signature?: QuoteSignatureBlock;
  docRef: string;            // e.g. "MSA — Acme Corp — 2026-08-31"
}): string {
  const d = data;
  const businessName = escapeHtml(d.businessName || 'Rivertown Technology');
  const phone = escapeHtml(d.businessPhone || '(843) 410-3982');
  const email = escapeHtml(d.businessEmail || 'sales@rivertowntechnology.com');
  const location = [d.businessCity, d.businessState].filter(Boolean).map(v => escapeHtml(v as string)).join(', ') || 'Conway, South Carolina';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(d.title)}</title>
${BS_FONT_LINK}
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size: letter; margin: 0; }
  html, body { background:${BS.bg}; }
  body { font-family:${BS.font}; color:${BS.text}; font-size:13px; line-height:1.6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:8.5in; min-height:11in; padding:0.6in 0.68in 0.55in; display:flex; flex-direction:column; gap:20px; }
  .content h1, .content h2, .content h3 { font-weight:600; margin:18px 0 8px; }
  .content h1 { font-size:24px; } .content h2 { font-size:18px; } .content h3 { font-size:15px; }
  .content p, .content li { margin:0 0 10px; }
  .content ul, .content ol { padding-left:20px; }
</style></head>
<body>
<section class="page">
  <header>
    ${bsTopRail(`Veteran-Owned · ${location}`, escapeHtml(d.title))}
    <h1 style="font-size:28px;font-weight:600;margin:16px 0 0">${escapeHtml(d.title)}</h1>
  </header>
  <div class="content">${d.contentHtml}</div>
  ${d.signature ? bsSignatureCertificate(d.signature, d.docRef) : ''}
  <footer style="margin-top:auto">
    ${bsBottomRail(phone, email, businessName)}
  </footer>
</section>
</body></html>`;
}

export function getDefaultMsaTemplate(): string {
  return `<h2>Master Service Agreement</h2>
<p>This Master Service Agreement ("Agreement") is entered into as of {{effectiveDate}} between <strong>{{businessName}}</strong> ("Provider") and <strong>{{customerName}}</strong> ("Client"), and governs the managed IT services described in Quote {{quoteNumber}}.</p>
<h3>1. Services</h3>
<p>Provider will deliver the managed services described in the accepted quote. Service scope, quantities, and pricing are as stated in Quote {{quoteNumber}} and any subsequently accepted quotes or change orders.</p>
<h3>2. Term — Month to Month</h3>
<p>This Agreement is month to month. It begins on {{effectiveDate}} and renews automatically each month until either party gives written notice of termination at least thirty (30) days before the end of the then-current monthly term. There is no long-term commitment and no early-termination fee.</p>
<h3>3. Fees &amp; Billing</h3>
<p>Fees are billed monthly in advance at the rates in the accepted quote. Invoices are due on receipt unless otherwise stated. Work outside the scope of the accepted quote will be quoted and approved before any billing.</p>
<h3>4. Client Responsibilities</h3>
<p>Client will provide reasonable access to systems, timely responses to requests, and accurate information necessary for Provider to deliver the services.</p>
<h3>5. Confidentiality</h3>
<p>Each party will keep the other party's non-public information confidential and use it only to perform under this Agreement.</p>
<h3>6. Limitation of Liability</h3>
<p>Neither party is liable for indirect, incidental, or consequential damages. Provider's total liability under this Agreement is limited to the fees paid by Client in the three (3) months preceding the claim.</p>
<h3>7. Governing Law</h3>
<p>This Agreement is governed by the laws of the State of South Carolina.</p>
<p style="margin-top:16px">Questions about this Agreement can be directed to {{businessEmail}}.</p>`;
}
