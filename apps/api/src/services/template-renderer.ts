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
        <p>Thank you for approving {{#quoteNumber}}Quote #{{quoteNumber}}{{/quoteNumber}}{{^quoteNumber}}your quote{{/quoteNumber}}! The last step is to sign your service agreement. It's a simple <strong>month-to-month</strong> agreement — no long-term commitment, and it includes our 30-day money-back guarantee.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
          {{#msaNumber}}<tr><td style="padding:12px 16px;color:#6b7280;width:160px">Agreement No.</td><td style="padding:12px 16px;font-weight:600">{{msaNumber}}</td></tr>{{/msaNumber}}
          {{#effectiveDate}}<tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Effective Date</td><td style="padding:12px 16px;border-top:1px solid #e5e7eb">{{effectiveDate}}</td></tr>{{/effectiveDate}}
          <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Term</td><td style="padding:12px 16px;border-top:1px solid #e5e7eb">Month to month · 30 days' notice to cancel</td></tr>
          {{#quoteNumber}}<tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Covers</td><td style="padding:12px 16px;border-top:1px solid #e5e7eb">Services in accepted Quote #{{quoteNumber}}</td></tr>{{/quoteNumber}}
        </table>
        <div style="text-align:center;margin:28px 0">
          <a href="{{signAgreementUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Review &amp; Sign Agreement</a>
        </div>
        <p style="margin:16px 0;color:#6b7280;font-size:13px">Signing takes less than a minute — review the agreement, then type your name, email, and phone number. You'll receive a fully signed copy for your records right after.</p>
      ${footer}`,
      bodyText: '{{agreementTitle}} {{msaNumber}}\n\nThank you for approving Quote #{{quoteNumber}}. Please review and sign your month-to-month service agreement (effective {{effectiveDate}}):\n{{signAgreementUrl}}\n\nYou will receive a fully signed copy for your records after signing.',
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
  signerEmail?: string;
  signerPhone?: string;
  idOnFile?: boolean; // identity captured/verified during signing (stored separately, never embedded)
  idVerifiedVia?: 'stripe' | 'photo';
}

function bsSignatureCertificate(sig: QuoteSignatureBlock, docRef: string): string {
  const contact = [sig.signerEmail, sig.signerPhone].filter(Boolean).map(v => escapeHtml(v as string)).join(' · ');
  return `<section style="margin-top:8px">
    <div style="font-size:11.5px;letter-spacing:0.14em;text-transform:uppercase;color:${BS.accent700};margin-bottom:10px">Electronically Signed</div>
    <div style="font-size:26px;font-weight:600;font-style:italic;margin-bottom:6px">${escapeHtml(sig.signerName)}</div>
    <div style="font-size:12px;line-height:1.7;color:${BS.neutral700}">
      Signed electronically by typed-name signature · ${escapeHtml(sig.signedAt)}<br>
      ${contact ? `${contact}<br>` : ''}IP address (as reported): ${escapeHtml(sig.ipAddress)} · Document: ${escapeHtml(docRef)}${sig.idOnFile ? `<br>${sig.idVerifiedVia === 'stripe' ? 'Identity verified via Stripe Identity document verification' : 'Photo ID captured and held on file for verification'}` : ''}
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
  /* White ground — the design's paper-gray tint reads as a scanned copy in PDF */
  html, body { background:#ffffff; }
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
      ${d.footer ? d.footer.split(/\r?\n/)
        .filter(l => l.trim())
        // The quote's own valid-until date is authoritative — drop static
        // "valid for N days" boilerplate from the footer setting so the two
        // never contradict each other.
        .filter(l => !(validUntil && /valid/i.test(l)))
        .map(l => `<li>${escapeHtml(l.trim())}</li>`).join('') : ''}
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
  // When set, a photo-ID capture step (camera or upload) is required before signing.
  // qrDataUrl: QR image (data URI) linking to the mobile capture page;
  // statusEndpoint: polled so a phone upload marks the step complete here.
  idCapture?: { uploadEndpoint: string; qrDataUrl?: string; statusEndpoint?: string };
  // Stripe Identity mode (takes precedence over idCapture): hosted document
  // verification. startEndpoint returns { url }; statusEndpoint is polled.
  idVerify?: { startEndpoint: string; statusEndpoint: string; initialStatus: string };
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
      <label for="signerEmail">Email *</label>
      <input type="email" id="signerEmail" name="signerEmail" required autocomplete="email" placeholder="you@company.com">
      <label for="signerPhone">Phone number *</label>
      <input type="tel" id="signerPhone" name="signerPhone" required minlength="7" maxlength="30" autocomplete="tel" placeholder="(843) 555-0123">
      ${d.idVerify ? `
      <label>Identity verification *</label>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px">We verify your government-issued ID through Stripe Identity — it takes about a minute and works on this device or your phone.</p>
      <div id="verifyBox">
        <button type="button" id="verifyBtn" style="background:#374151;color:#fff;border:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer">🪪 Verify My Identity</button>
        <div id="verifyStatus" style="font-size:14px;margin-top:8px;color:#6b7280"></div>
      </div>
      ` : ''}
      ${d.idCapture && !d.idVerify ? `
      <label>Photo ID *</label>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Take a photo of your government-issued ID (driver's license or similar), or upload an image. It is stored securely for verification and never shared.</p>
      <div id="idControls" style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" id="idCameraBtn" style="background:#374151;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer">📷 Take Photo</button>
        ${d.idCapture?.qrDataUrl ? `<button type="button" id="idQrBtn" style="background:#fff;color:#374151;border:1px solid #d1d5db;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer">📱 Scan with Phone</button>` : ''}
        <button type="button" id="idFileBtn" style="background:#fff;color:#374151;border:1px solid #d1d5db;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer">Upload File</button>
        <input type="file" id="idFileInput" accept="image/*" capture="environment" style="display:none">
      </div>
      ${d.idCapture?.qrDataUrl ? `
      <div id="qrWrap" style="display:none;margin-top:10px;text-align:center;max-width:280px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
        <img src="${d.idCapture.qrDataUrl}" alt="Scan to capture ID on your phone" style="width:200px;height:200px">
        <p style="margin:8px 0 0;font-size:13px;color:#6b7280">Scan with your phone's camera to take the photo there. This page updates automatically when it's done.</p>
      </div>` : ''}
      <div id="camWrap" style="display:none;margin-top:10px">
        <video id="camVideo" autoplay playsinline style="width:100%;max-width:480px;border-radius:8px;background:#000"></video>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button type="button" id="camCapture" style="background:#16a34a;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-weight:600;cursor:pointer">Capture</button>
          <button type="button" id="camCancel" style="background:none;border:1px solid #d1d5db;padding:10px 20px;border-radius:6px;cursor:pointer">Cancel</button>
        </div>
      </div>
      <div id="idPreviewWrap" style="display:none;margin-top:10px">
        <img id="idPreview" alt="ID preview" style="max-width:280px;border-radius:8px;border:1px solid #d1d5db">
        <div id="idStatus" style="font-size:13px;margin-top:6px;color:#6b7280"></div>
      </div>
      ` : ''}
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

    // ── Stripe Identity verification (only present on pages that require it) ──
    var verifyRequired = ${d.idVerify ? 'true' : 'false'};
    var verifyStatus = ${JSON.stringify(d.idVerify?.initialStatus ?? 'none')};
    var verifyStartEndpoint = ${JSON.stringify(d.idVerify?.startEndpoint ?? '')};
    var verifyStatusEndpoint = ${JSON.stringify(d.idVerify?.statusEndpoint ?? '')};
    var verifyPollTimer = null;
    function verifyDone(s) { return s === 'processing' || s === 'verified'; }
    function renderVerifyStatus() {
      var el = document.getElementById('verifyStatus');
      var btn = document.getElementById('verifyBtn');
      if (!el) return;
      if (verifyStatus === 'verified') {
        el.textContent = '✓ Identity verified';
        el.style.color = '#16a34a';
        if (btn) btn.style.display = 'none';
      } else if (verifyStatus === 'processing') {
        el.textContent = '✓ Documents submitted — verification is processing. You can sign now.';
        el.style.color = '#16a34a';
        if (btn) btn.style.display = 'none';
      } else if (verifyStatus === 'requires_input') {
        el.textContent = 'Verification needs another attempt — please try again.';
        el.style.color = '#dc2626';
        if (btn) { btn.style.display = ''; btn.textContent = '🪪 Retry Verification'; }
      } else {
        el.textContent = '';
      }
    }
    function pollVerifyStatus() {
      if (!verifyStatusEndpoint || verifyStatus === 'verified') return;
      fetch(verifyStatusEndpoint).then(function(r) { return r.json(); })
        .then(function(j) {
          if (j && j.status && j.status !== verifyStatus) { verifyStatus = j.status; renderVerifyStatus(); }
          if (verifyStatus === 'verified' && verifyPollTimer) { clearInterval(verifyPollTimer); verifyPollTimer = null; }
        }).catch(function() {});
    }
    if (verifyRequired) {
      renderVerifyStatus();
      // Poll so the page updates after the customer returns from Stripe (or
      // completes verification on their phone via Stripe's own hand-off)
      verifyPollTimer = setInterval(pollVerifyStatus, 4000);
      var vBtn = document.getElementById('verifyBtn');
      if (vBtn) {
        vBtn.addEventListener('click', function() {
          vBtn.disabled = true; vBtn.textContent = 'Starting…';
          fetch(verifyStartEndpoint, { method: 'POST' })
            .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
            .then(function(res) {
              if (res.ok && res.body && res.body.url) { window.location.href = res.body.url; }
              else {
                vBtn.disabled = false; vBtn.textContent = '🪪 Verify My Identity';
                showError((res.body && (res.body.message || res.body.error)) || 'Could not start verification. Please try again.');
              }
            }).catch(function() {
              vBtn.disabled = false; vBtn.textContent = '🪪 Verify My Identity';
              showError('Could not start verification. Please try again.');
            });
        });
      }
    }

    // ── Photo ID capture (only present on pages that require it) ──
    var idRequired = ${d.idCapture && !d.idVerify ? 'true' : 'false'};
    var idUploaded = false;
    var idUploadEndpoint = ${JSON.stringify(d.idCapture?.uploadEndpoint ?? '')};
    var camStream = null;
    function stopCam() {
      if (camStream) { camStream.getTracks().forEach(function(t) { t.stop(); }); camStream = null; }
      var w = document.getElementById('camWrap');
      if (w) w.style.display = 'none';
    }
    function setIdStatus(msg, ok) {
      var s = document.getElementById('idStatus');
      if (s) { s.textContent = msg; s.style.color = ok ? '#16a34a' : '#dc2626'; }
    }
    function uploadIdImage(canvas) {
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      var wrap = document.getElementById('idPreviewWrap');
      var previewImg = document.getElementById('idPreview');
      previewImg.src = dataUrl;
      previewImg.style.display = '';
      wrap.style.display = 'block';
      setIdStatus('Uploading…', true);
      fetch(idUploadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'photo-id.jpg',
          mimeType: 'image/jpeg',
          dataBase64: dataUrl.split(',')[1],
        }),
      }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
        .then(function(res) {
          if (res.ok) { idUploaded = true; setIdStatus('✓ ID attached', true); }
          else { setIdStatus((res.body && res.body.message) || 'Upload failed — please try again.', false); }
        }).catch(function() { setIdStatus('Upload failed — please try again.', false); });
    }
    function downscaleToCanvas(source, w, h) {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    // Poll for a phone-side upload (QR hand-off) so this page marks the ID
    // step complete without a refresh
    var idStatusEndpoint = ${JSON.stringify(d.idCapture?.statusEndpoint ?? '')};
    var idPollTimer = null;
    function markIdUploadedRemotely() {
      idUploaded = true;
      var wrap = document.getElementById('idPreviewWrap');
      var img = document.getElementById('idPreview');
      if (img && !img.src) img.style.display = 'none';
      if (wrap) wrap.style.display = 'block';
      var qr = document.getElementById('qrWrap');
      if (qr) qr.style.display = 'none';
      stopCam();
      setIdStatus('✓ ID attached from your phone', true);
      if (idPollTimer) { clearInterval(idPollTimer); idPollTimer = null; }
    }
    if (idRequired && idStatusEndpoint) {
      idPollTimer = setInterval(function() {
        if (idUploaded) { clearInterval(idPollTimer); idPollTimer = null; return; }
        fetch(idStatusEndpoint).then(function(r) { return r.json(); })
          .then(function(j) { if (j && j.uploaded && !idUploaded) markIdUploadedRemotely(); })
          .catch(function() {});
      }, 4000);
    }
    var qrBtn = document.getElementById('idQrBtn');
    if (qrBtn) {
      qrBtn.addEventListener('click', function() {
        stopCam();
        var qr = document.getElementById('qrWrap');
        qr.style.display = qr.style.display === 'none' ? 'block' : 'none';
      });
    }

    var camBtn = document.getElementById('idCameraBtn');
    if (camBtn) {
      camBtn.addEventListener('click', function() {
        var video = document.getElementById('camVideo');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
          .then(function(stream) {
            camStream = stream;
            video.srcObject = stream;
            document.getElementById('camWrap').style.display = 'block';
          })
          .catch(function() {
            // No camera / permission denied — fall back to the file picker
            document.getElementById('idFileInput').click();
          });
      });
      document.getElementById('camCapture').addEventListener('click', function() {
        var video = document.getElementById('camVideo');
        if (!video.videoWidth) return;
        var canvas = downscaleToCanvas(video, video.videoWidth, video.videoHeight);
        stopCam();
        uploadIdImage(canvas);
      });
      document.getElementById('camCancel').addEventListener('click', stopCam);
      document.getElementById('idFileBtn').addEventListener('click', function() {
        document.getElementById('idFileInput').click();
      });
      document.getElementById('idFileInput').addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var img = new Image();
        img.onload = function() {
          uploadIdImage(downscaleToCanvas(img, img.naturalWidth, img.naturalHeight));
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(file);
      });
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      errEl.style.display = 'none';
      if (idRequired && !idUploaded) {
        showError('Please attach a photo of your ID before signing.');
        return;
      }
      if (verifyRequired && !verifyDone(verifyStatus)) {
        showError('Please complete identity verification before signing.');
        return;
      }
      var btn = document.getElementById('approveBtn');
      btn.disabled = true; btn.textContent = 'Signing…';
      fetch(${JSON.stringify(d.signEndpoint)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: document.getElementById('signerName').value.trim(),
          signerEmail: document.getElementById('signerEmail').value.trim(),
          signerPhone: document.getElementById('signerPhone').value.trim(),
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

/**
 * Focused mobile page for the QR hand-off: capture/upload a photo ID on a
 * phone while the signing page stays open on the computer.
 */
export function generateIdCapturePage(data: {
  businessName: string;
  docLabel: string;
  uploadEndpoint: string;
  alreadyUploaded: boolean;
}): string {
  const d = data;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photo ID — ${escapeHtml(d.businessName)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:system-ui,-apple-system,sans-serif; background:#f3f4f6; color:#374151; margin:0; padding:20px; }
  .card { background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.1); padding:24px; max-width:480px; margin:0 auto; }
  h1 { font-size:20px; color:#111; margin:0 0 6px; }
  .btn { display:block; width:100%; border:none; border-radius:8px; padding:16px; font-weight:600; font-size:16px; cursor:pointer; margin-top:12px; }
  .btn-primary { background:#374151; color:#fff; }
  .btn-secondary { background:#fff; color:#374151; border:1px solid #d1d5db; }
  .btn-capture { background:#16a34a; color:#fff; }
  video, img.preview { width:100%; border-radius:8px; margin-top:12px; background:#000; }
  #idStatus { font-size:14px; margin-top:10px; text-align:center; }
</style></head>
<body>
  <div class="card">
    <h1>Photo ID</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${escapeHtml(d.docLabel)} · ${escapeHtml(d.businessName)}</p>
    ${d.alreadyUploaded ? `
    <p style="color:#16a34a;font-weight:600;margin-top:16px">✓ Your ID is already attached. You can return to the signing page — it updates automatically. To replace it, capture a new photo below.</p>
    ` : `
    <p style="margin-top:12px;font-size:14px;line-height:1.5">Take a photo of your government-issued ID (driver's license or similar). It is stored securely for verification and never shared.</p>
    `}
    <button type="button" class="btn btn-primary" id="idCameraBtn">📷 Take Photo</button>
    <button type="button" class="btn btn-secondary" id="idFileBtn">Choose from Library</button>
    <input type="file" id="idFileInput" accept="image/*" capture="environment" style="display:none">
    <div id="camWrap" style="display:none">
      <video id="camVideo" autoplay playsinline></video>
      <button type="button" class="btn btn-capture" id="camCapture">Capture</button>
      <button type="button" class="btn btn-secondary" id="camCancel">Cancel</button>
    </div>
    <div id="idPreviewWrap" style="display:none">
      <img id="idPreview" class="preview" alt="ID preview">
      <div id="idStatus"></div>
    </div>
  </div>
  <script>
  (function() {
    var camStream = null;
    function stopCam() {
      if (camStream) { camStream.getTracks().forEach(function(t) { t.stop(); }); camStream = null; }
      document.getElementById('camWrap').style.display = 'none';
    }
    function setIdStatus(msg, ok) {
      var s = document.getElementById('idStatus');
      s.textContent = msg; s.style.color = ok ? '#16a34a' : '#dc2626';
    }
    function uploadIdImage(canvas) {
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('idPreview').src = dataUrl;
      document.getElementById('idPreviewWrap').style.display = 'block';
      setIdStatus('Uploading…', true);
      fetch(${JSON.stringify(d.uploadEndpoint)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'photo-id.jpg', mimeType: 'image/jpeg', dataBase64: dataUrl.split(',')[1] }),
      }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
        .then(function(res) {
          if (res.ok) setIdStatus('✓ ID uploaded — you can return to the signing page. It updates automatically.', true);
          else setIdStatus((res.body && res.body.message) || 'Upload failed — please try again.', false);
        }).catch(function() { setIdStatus('Upload failed — please try again.', false); });
    }
    function downscaleToCanvas(source, w, h) {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    document.getElementById('idCameraBtn').addEventListener('click', function() {
      var video = document.getElementById('camVideo');
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
        .then(function(stream) {
          camStream = stream;
          video.srcObject = stream;
          document.getElementById('camWrap').style.display = 'block';
        })
        .catch(function() { document.getElementById('idFileInput').click(); });
    });
    document.getElementById('camCapture').addEventListener('click', function() {
      var video = document.getElementById('camVideo');
      if (!video.videoWidth) return;
      var canvas = downscaleToCanvas(video, video.videoWidth, video.videoHeight);
      stopCam();
      uploadIdImage(canvas);
    });
    document.getElementById('camCancel').addEventListener('click', stopCam);
    document.getElementById('idFileBtn').addEventListener('click', function() {
      document.getElementById('idFileInput').click();
    });
    document.getElementById('idFileInput').addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var img = new Image();
      img.onload = function() {
        uploadIdImage(downscaleToCanvas(img, img.naturalWidth, img.naturalHeight));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
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
  msaNumber: string;         // e.g. "MSA-2026-004"
  contentHtml: string;       // trusted, admin-authored template rendered with escaped merge values
  businessName: string; businessPhone: string; businessEmail: string;
  businessCity?: string; businessState?: string; businessWebsite?: string;
  clientName: string;
  // Provider countersignature — auto-applied when the client signs.
  providerSigner?: { name: string; title: string; signedAt: string };
  clientSignature?: QuoteSignatureBlock;
  docRef: string;            // e.g. "MSA-2026-004 — Acme Corp"
}): string {
  const d = data;
  const businessName = escapeHtml(d.businessName || 'Rivertown Technology, LLC');
  const phone = escapeHtml(d.businessPhone || '(843) 410-3982');
  const email = escapeHtml(d.businessEmail || 'sales@rivertowntechnology.com');
  const website = escapeHtml((d.businessWebsite || 'rivertowntechnology.com').replace(/^https?:\/\//, ''));
  const location = [d.businessCity, d.businessState].filter(Boolean).map(v => escapeHtml(v as string)).join(', ') || 'Conway, South Carolina';
  const clientName = escapeHtml(d.clientName);
  const msaNumber = escapeHtml(d.msaNumber);
  const logo = brandingAsset('Horizontal_transparent_background.png');
  const blankLine = `<div style="border-bottom:1px solid ${BS.neutral500};height:26px"></div>`;

  const providerBlock = d.providerSigner ? `
    <div style="font-size:24px;font-weight:600;font-style:italic;border-bottom:1px solid ${BS.neutral500};padding:0 0 2px;min-height:26px">${escapeHtml(d.providerSigner.name)}</div>
    <div style="color:${BS.neutral700};font-size:11.5px;margin:4px 0 16px">Signature (electronic)</div>
    <div>Name: <strong>${escapeHtml(d.providerSigner.name)}</strong></div>
    <div style="margin-top:8px">Title: <strong>${escapeHtml(d.providerSigner.title)}</strong></div>
    <div style="margin-top:8px">Date: <strong>${escapeHtml(d.providerSigner.signedAt)}</strong></div>` : `
    ${blankLine}
    <div style="color:${BS.neutral700};font-size:11.5px;margin:4px 0 16px">Signature</div>
    <div>Name: ______________________________</div>
    <div style="margin-top:8px">Title: ______________________________</div>
    <div style="margin-top:8px">Date: ______________________________</div>`;

  const clientBlock = d.clientSignature ? `
    <div style="font-size:24px;font-weight:600;font-style:italic;border-bottom:1px solid ${BS.neutral500};padding:0 0 2px;min-height:26px">${escapeHtml(d.clientSignature.signerName)}</div>
    <div style="color:${BS.neutral700};font-size:11.5px;margin:4px 0 16px">Signature (electronic)</div>
    <div>Name: <strong>${escapeHtml(d.clientSignature.signerName)}</strong></div>
    ${d.clientSignature.signerEmail ? `<div style="margin-top:8px">Email: <strong>${escapeHtml(d.clientSignature.signerEmail)}</strong></div>` : ''}
    ${d.clientSignature.signerPhone ? `<div style="margin-top:8px">Phone: <strong>${escapeHtml(d.clientSignature.signerPhone)}</strong></div>` : ''}
    <div style="margin-top:8px">Date: <strong>${escapeHtml(d.clientSignature.signedAt)}</strong></div>` : `
    ${blankLine}
    <div style="color:${BS.neutral700};font-size:11.5px;margin:4px 0 16px">Signature</div>
    <div>Name: ______________________________</div>
    <div style="margin-top:8px">Title: ______________________________</div>
    <div style="margin-top:8px">Date: ______________________________</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(d.title)} ${msaNumber}</title>
${BS_FONT_LINK}
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size: letter; margin: 0.55in 0; }
  /* White ground — a tinted body against unpainted @page margins looks like a
     scan (gray text ground with white bands at header/footer) */
  html, body { background:#ffffff; }
  body { font-family:${BS.font}; color:${BS.text}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:8.5in; padding:0 0.85in; }
  .content h2 { font-size:17px; font-weight:600; margin:22px 0 8px; }
  .content h1 { font-size:24px; font-weight:600; margin:22px 0 8px; }
  .content p { font-size:13.5px; line-height:1.65; margin:0 0 8px; }
  .content ul, .content ol { padding-left:20px; font-size:13.5px; line-height:1.65; margin:0 0 8px; }
  .sig-block { break-inside:avoid; margin-top:34px; }
</style></head>
<body>
<section class="page">
  ${bsTopRail(`Veteran-Owned · ${location}`, `MSA No. ${msaNumber}`)}
  ${logo
    ? `<img src="${logo}" alt="${businessName}" style="height:54px;width:auto;display:block;margin:20px 0 10px">`
    : `<div style="font-size:26px;font-weight:600;margin:20px 0 10px">${businessName}</div>`}
  <h1 style="font-size:32px;font-weight:600;margin:0 0 6px">${escapeHtml(d.title)}</h1>
  <div class="content">${d.contentHtml}</div>
  <div class="sig-block">
    <div style="border-top:1px solid ${BS.text};border-bottom:3px solid ${BS.text};padding:6px 0;font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:18px">Agreed and accepted</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:13px">
      <div>
        <div style="font-weight:600;margin-bottom:26px">${businessName}</div>
        ${providerBlock}
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:26px">${clientName}</div>
        ${clientBlock}
      </div>
    </div>
    ${d.clientSignature ? bsSignatureCertificate(d.clientSignature, d.docRef) : ''}
    <p style="font-size:11px;color:${BS.neutral500};margin:26px 0 0;line-height:1.5">${businessName} · ${location} · ${phone} · ${email} · ${website}</p>
  </div>
</section>
</body></html>`;
}

export function getDefaultMsaTemplate(): string {
  return `<p style="font-style:italic;font-size:14px;margin:0 0 24px">This Master Services Agreement ("Agreement") is entered into as of {{effectiveDate}} (the "Effective Date") by and between <strong style="font-style:normal">Rivertown Technology, LLC</strong>, a South Carolina limited liability company with its principal place of business in Conway, South Carolina ("Provider"), and <strong style="font-style:normal">{{customerName}}</strong>, with its principal place of business at {{customerAddress}} ("Client"). Provider and Client may each be referred to as a "Party" and together as the "Parties."</p>
<h2>1. Services</h2>
<p>1.1 Provider will perform the managed information technology, cybersecurity, cloud, and related services described in one or more quotes or proposals accepted by Client in writing or by email (each, a "Quote"). Each accepted Quote is incorporated into and governed by this Agreement.</p>
<p>1.2 In the event of a conflict between this Agreement and a Quote, the Quote controls for that engagement only.</p>
<p>1.3 Day-to-day support requests are submitted, tracked, and resolved through Provider's ticketing system; Client agrees to route support requests through that system (or Provider's support phone line) so work can be tracked and documented. Provider delivers support remotely or onsite, as the issue reasonably requires. Support hours, response times, and included services are as stated in the applicable Quote and Provider's then-current published service tiers.</p>
<h2>2. Term and Termination</h2>
<p>2.1 This Agreement begins on the Effective Date and continues on a <strong>month-to-month</strong> basis until terminated by either Party with thirty (30) days' written notice. Where a Quote includes Microsoft 365 or other third-party licensing that requires an annual or longer commitment, the term for those licenses is one (1) year (or the required commitment period); Client remains responsible for those license fees through the end of that commitment even if managed services are otherwise terminated.</p>
<p>2.2 Either Party may terminate immediately for a material breach that remains uncured fifteen (15) days after written notice.</p>
<p>2.3 <em>Money-back guarantee.</em> If Client terminates within the first thirty (30) days of the initial Quote, Provider will refund the managed services fees paid for that period.</p>
<p>2.4 Upon termination, Provider will reasonably cooperate in the orderly transition of services, including return of Client credentials and documentation. Transition assistance beyond ten (10) hours may be billed at Provider's standard hourly rate.</p>
<h2>3. Fees and Payment</h2>
<p>3.1 Client will pay the fees stated in each accepted Quote. Recurring fees are billed monthly in advance; time-and-materials work is billed monthly in arrears. Invoices are due within fifteen (15) days.</p>
<p>3.2 Third-party licensing (including Microsoft 365 and Google Workspace subscriptions), hardware, and project work outside the scope of routine support are quoted and billed separately. Projects may be billable depending on their complexity, scope, and effort; Provider will identify billable project work and provide a Quote for Client's approval before the work begins.</p>
<p>3.3 After-hours emergency and weekend support is included or billable per the Client's service tier as stated in the applicable Quote.</p>
<p>3.4 Amounts more than thirty (30) days past due may accrue interest at 1.5% per month or the maximum lawful rate, whichever is less. Provider may suspend services for accounts more than forty-five (45) days past due after written notice.</p>
<h2>4. Client Responsibilities</h2>
<p>4.1 Client will provide timely access to systems, personnel, credentials, and information reasonably required for Provider to perform the services, and will maintain lawful licenses for all software Provider is asked to manage.</p>
<p>4.2 Client is responsible for the accuracy and legality of its data and for its personnel's compliance with reasonable security policies communicated by Provider.</p>
<h2>5. Third-Party Services and Data Backup</h2>
<p>5.1 Services may depend on third-party platforms (including Microsoft 365, Google Workspace, and hosting or telecommunications providers). Those platforms are governed by their own terms, and Provider does not control and is not responsible for their availability, security, or data-retention practices.</p>
<p>5.2 <em>Backup responsibility.</em> Client acknowledges that, under their own terms of service, Microsoft and Google are not responsible for restoring lost Microsoft 365 or Google Workspace data. Backup of such data is Client's responsibility unless Client subscribes to a backup service under a Quote, in which case Provider's responsibility is limited to operating that service as described.</p>
<p>5.3 <em>Security incidents.</em> Cybersecurity threats evolve constantly, and no service, tool, or combination of services — including any backup or cybersecurity package — can guarantee the prevention of all data loss, downtime, or security incidents. Provider does not warrant that the services will detect or prevent every threat, and Provider is not responsible or liable for security breaches, ransomware, phishing, social engineering, zero-day exploits, or other malicious acts of third parties, except to the extent caused by Provider's gross negligence or willful misconduct. Provider will perform services in a professional and workmanlike manner consistent with industry standards.</p>
<p>5.4 Provider may recommend security services, tooling, or practices from time to time. If Client declines a recommended security measure, Client assumes the risks associated with that decision, and Provider is not liable for incidents that the declined measure was designed to mitigate.</p>
<h2>6. Confidentiality</h2>
<p>Each Party will protect the other's non-public information with at least the care it uses for its own confidential information (and no less than reasonable care), use it only to perform under this Agreement, and disclose it only to personnel and contractors bound by comparable obligations, or as required by law. This section survives termination for three (3) years; trade secrets are protected for as long as they remain trade secrets.</p>
<h2>7. Data Security and Privacy</h2>
<p>Provider will maintain commercially reasonable administrative, technical, and physical safeguards for Client data it accesses or stores. Where Client is subject to specific regulatory regimes (e.g., HIPAA, PCI-DSS), the Parties will execute the applicable addenda (e.g., a Business Associate Agreement) before Provider handles regulated data, and compliance-scoped services will be stated in a Quote.</p>
<h2>8. Warranties and Disclaimer</h2>
<p>Each Party warrants it has the authority to enter this Agreement. Provider warrants the services will be performed in a professional and workmanlike manner. EXCEPT AS EXPRESSLY STATED, THE SERVICES ARE PROVIDED "AS IS" AND PROVIDER DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
<h2>9. Limitation of Liability</h2>
<p>NEITHER PARTY IS LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, OR DATA. EACH PARTY'S TOTAL LIABILITY ARISING OUT OF THIS AGREEMENT IS LIMITED TO THE FEES PAID BY CLIENT TO PROVIDER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. THESE LIMITS DO NOT APPLY TO BREACHES OF SECTION 6, A PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR CLIENT'S PAYMENT OBLIGATIONS.</p>
<h2>10. Insurance</h2>
<p>Provider maintains commercially reasonable general liability and cyber/errors-and-omissions insurance and will furnish certificates of insurance upon written request.</p>
<h2>11. Independent Contractor; Non-Solicitation</h2>
<p>Provider is an independent contractor; nothing here creates a partnership, joint venture, or employment relationship. During the term and for twelve (12) months after, neither Party will solicit for employment the other's personnel who performed under this Agreement, except through general postings not targeted at such personnel.</p>
<h2>12. Force Majeure</h2>
<p>Neither Party is liable for delay or failure caused by events beyond its reasonable control, including natural disasters, hurricanes, utility or internet outages, acts of government, or third-party platform failures, provided the affected Party gives prompt notice and resumes performance as soon as practicable.</p>
<h2>13. General</h2>
<p>This Agreement is governed by the laws of the State of South Carolina, with exclusive venue in the state and federal courts of Horry County, South Carolina. It, together with all accepted Quotes, is the entire agreement between the Parties and supersedes all prior discussions. Amendments must be in writing and signed by both Parties. Neither Party may assign this Agreement without the other's consent, except to a successor in a merger or sale of substantially all assets. If any provision is unenforceable, the remainder stays in effect. Notices must be in writing to the addresses on the signature page (email acceptable with confirmation of receipt).</p>`;
}
