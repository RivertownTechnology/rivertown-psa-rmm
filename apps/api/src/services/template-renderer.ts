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
        <p style="margin:16px 0;color:#6b7280;font-size:13px">Please reply to this email with any questions or to approve this quote.</p>
      ${footer}`,
      bodyText: 'Quote #{{quoteNumber}}: {{quoteTitle}}\nTotal: ${{totalFormatted}}\nValid until: {{validUntil}}\n\n{{quoteSummary}}',
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
        {{#paymentUrl}}<div style="text-align:center;margin:24px 0"><a href="{{paymentUrl}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Pay Now</a></div>{{/paymentUrl}}
      ${footer}`,
      bodyText: 'Invoice #{{invoiceNumber}}\nAmount: ${{totalFormatted}}\nDue: {{dueDate}}\n\n{{invoiceNotes}}',
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
        <p>Your customer portal account has been created. You can now:</p>
        <ul style="color:#374151">
          <li>Submit and track support tickets</li>
          <li>View and approve quotes</li>
          <li>View and pay invoices</li>
          <li>See your devices and assets</li>
        </ul>
        <p>Log in at: <a href="{{portalUrl}}" style="color:#2563eb">{{portalUrl}}</a></p>
        <p style="color:#6b7280;font-size:13px">Your username is: {{contactEmail}}</p>
      ${footer}`,
      bodyText: 'Welcome to the {{businessName}} Customer Portal!\n\nLog in at: {{portalUrl}}\nUsername: {{contactEmail}}',
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
  const headerBg = isModern ? '#2563eb' : isClassic ? '#f8f9fa' : '#ffffff';
  const headerText = isModern ? '#ffffff' : '#111111';

  const rows = d.lineItems.map(li => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${li.description}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${li.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${li.unitPrice}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${li.total}</td>
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
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding:24px;background:${headerBg};border-radius:8px">
    <div>
      ${d.businessLogo ? `<img src="${d.businessLogo}" style="max-height:60px;margin-bottom:8px"><br>` : ''}
      <div style="font-size:20px;font-weight:700;color:${headerText}">${d.businessName}</div>
      <div style="font-size:12px;color:${isModern ? 'rgba(255,255,255,0.8)' : '#6b7280'};margin-top:4px">
        ${d.businessAddress ? `${d.businessAddress}<br>` : ''}${[d.businessCity, d.businessState].filter(Boolean).join(', ')}${d.businessZip ? ` ${d.businessZip}` : ''}${(d.businessPhone || d.businessEmail) ? '<br>' : ''}${[d.businessPhone, d.businessEmail].filter(Boolean).join(' | ')}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:700;color:${headerText}">INVOICE</div>
      <div style="font-size:16px;color:${isModern ? 'rgba(255,255,255,0.8)' : '#6b7280'};">#${d.invoiceNumber}</div>
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

  ${d.notes ? `<div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:16px"><div style="font-size:11px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Notes</div><div>${d.notes}</div></div>` : ''}
  ${d.paymentTerms ? `<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">${d.paymentTerms}</div>` : ''}
  ${d.footer ? `<div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">${d.footer}</div>` : ''}
</div></body></html>`;
}

// Same for quotes
export function generateQuoteHtml(data: {
  businessName: string; businessAddress: string; businessCity: string; businessState: string; businessZip: string;
  businessPhone: string; businessEmail: string; businessLogo: string;
  customerName: string; customerAddress?: string; customerCity?: string; customerState?: string;
  customerZip?: string; customerEmail?: string; customerPhone?: string;
  quoteNumber: number; title: string; validUntil: string; summary: string;
  lineItems: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string; tax: string; total: string;
  style: string; footer: string;
}): string {
  const d = data;
  const primaryColor = d.style === 'modern' ? '#2563eb' : d.style === 'classic' ? '#1a1a1a' : '#374151';
  const headerBg = d.style === 'modern' ? '#2563eb' : d.style === 'classic' ? '#f8f9fa' : '#ffffff';
  const headerText = d.style === 'modern' ? '#ffffff' : '#111111';

  const rows = d.lineItems.map(li => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${li.description}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${li.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${li.unitPrice}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${li.total}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quote #${d.quoteNumber}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:system-ui,-apple-system,sans-serif; color:#374151; font-size:14px; } @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } } .page { max-width:800px; margin:0 auto; padding:40px; } table { width:100%; border-collapse:collapse; }</style></head>
<body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding:24px;background:${headerBg};border-radius:8px">
    <div>
      ${d.businessLogo ? `<img src="${d.businessLogo}" style="max-height:60px;margin-bottom:8px"><br>` : ''}
      <div style="font-size:20px;font-weight:700;color:${headerText}">${d.businessName}</div>
      <div style="font-size:12px;color:${d.style === 'modern' ? 'rgba(255,255,255,0.8)' : '#6b7280'};margin-top:4px">${d.businessAddress ? `${d.businessAddress}<br>` : ''}${[d.businessCity, d.businessState].filter(Boolean).join(', ')}${d.businessZip ? ` ${d.businessZip}` : ''}${(d.businessPhone || d.businessEmail) ? '<br>' : ''}${[d.businessPhone, d.businessEmail].filter(Boolean).join(' | ')}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:700;color:${headerText}">QUOTE</div>
      <div style="font-size:16px;color:${d.style === 'modern' ? 'rgba(255,255,255,0.8)' : '#6b7280'};">#${d.quoteNumber}</div>
    </div>
  </div>
  <div style="margin-bottom:24px"><div style="font-size:20px;font-weight:600">${d.title}</div>
    <div style="color:#6b7280;margin-top:4px">Prepared for: <strong>${d.customerName}</strong>${d.customerAddress ? `, ${d.customerAddress}` : ''}${[d.customerCity, d.customerState].filter(Boolean).length ? `, ${[d.customerCity, d.customerState].filter(Boolean).join(', ')}` : ''}${d.customerZip ? ` ${d.customerZip}` : ''}${d.customerEmail ? ` | ${d.customerEmail}` : ''} | Valid until: <strong>${d.validUntil}</strong></div>
    ${d.summary ? `<p style="margin-top:8px">${d.summary}</p>` : ''}
  </div>
  <table style="margin-bottom:24px">
    <thead><tr style="background:#f9fafb">
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase">Description</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase">Qty</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase">Unit Price</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid ${primaryColor};font-size:12px;text-transform:uppercase">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <div style="width:250px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Subtotal</span><span>$${d.subtotal}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb"><span style="color:#6b7280">Tax</span><span>$${d.tax}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid ${primaryColor};font-size:18px;font-weight:700"><span>Total</span><span>$${d.total}</span></div>
    </div>
  </div>
  ${d.footer ? `<div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">${d.footer}</div>` : ''}
</div></body></html>`;
}
