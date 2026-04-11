/**
 * Template-based email sending for invoices, quotes, and payment receipts.
 * Includes full customer/billing variables and HTML attachment generation.
 */
import { eq, and } from 'drizzle-orm';
import {
  invoices, invoiceLineItems, quotes, quoteLineItems,
  customers, contacts, tenants, emailTemplates, payments, integrationConfigs,
} from '@rivertown/db';
import type { Database } from '@rivertown/db';
import Stripe from 'stripe';
import { sendEmail, sendBillingEmail } from './email.js';
import { renderTemplate, generateInvoiceHtml, generateQuoteHtml } from './template-renderer.js';
import { htmlToPdf } from './pdf-generator.js';

// --- Shared helpers ---

async function getBusinessVars(db: Database, tenantId: string): Promise<Record<string, string>> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const s = (tenant?.settings ?? {}) as Record<string, string>;
  return {
    businessName: s.businessName || tenant?.name || '',
    businessLogo: s.businessLogo || '',
    businessAddress: s.businessAddress || '',
    businessCity: s.businessCity || '',
    businessState: s.businessState || '',
    businessZip: s.businessZip || '',
    businessPhone: s.businessPhone || '',
    businessEmail: s.businessEmail || '',
  };
}

function buildCustomerVars(customer: {
  name: string; billingEmail?: string | null; phone?: string | null;
  address?: string | null; city?: string | null; state?: string | null; zip?: string | null;
}, contact?: { firstName: string; lastName: string; email: string; phone?: string | null; jobTitle?: string | null } | null): Record<string, string> {
  const fullAddr = [customer.address, [customer.city, customer.state].filter(Boolean).join(', '), customer.zip].filter(Boolean).join(' ');
  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : '';
  return {
    customerName: customer.name,
    customerCompany: customer.name,
    customerEmail: customer.billingEmail || '',
    customerPhone: customer.phone || '',
    customerAddress: customer.address || '',
    customerCity: customer.city || '',
    customerState: customer.state || '',
    customerZip: customer.zip || '',
    customerFullAddress: fullAddr,
    billToName: contactName || customer.name,
    billToCompany: customer.name,
    billToAddress: customer.address || '',
    billToCity: customer.city || '',
    billToState: customer.state || '',
    billToZip: customer.zip || '',
    billToFullAddress: fullAddr,
    contactName,
    contactEmail: contact?.email || customer.billingEmail || '',
    contactPhone: contact?.phone || '',
    contactJobTitle: contact?.jobTitle || '',
  };
}

async function getTemplate(db: Database, tenantId: string, templateType: string) {
  const [template] = await db.select().from(emailTemplates)
    .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.templateType, templateType), eq(emailTemplates.isActive, true)))
    .limit(1);
  return template;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Invoice Email ---

export async function sendInvoiceEmailWithTemplate(db: Database, tenantId: string, invoiceId: string): Promise<boolean> {
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);
  if (!invoice) return false;

  const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
  if (!customer?.billingEmail) return false;

  const lineItemRows = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId)).orderBy(invoiceLineItems.sortOrder);

  const lineItemsHtml = lineItemRows.length ? `<table style="width:100%;border-collapse:collapse">${lineItemRows.map(li =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${li.description}</td><td style="text-align:center;padding:6px;border-bottom:1px solid #eee">${li.quantity ?? '1'}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #eee">$${formatCents(li.unitPriceCents)}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #eee">$${formatCents(li.totalCents)}</td></tr>`
  ).join('')}</table>` : '';

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer),
    invoiceNumber: String(invoice.invoiceNumber),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalFormatted: formatCents(invoice.totalCents),
    amountFormatted: formatCents(invoice.totalCents),
    invoiceNotes: invoice.notes ?? '',
    invoicePaymentTerms: '',
    lineItemsHtml,
  };

  // Get payment terms from settings
  const bv = await getBusinessVars(db, tenantId);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const ts = (tenant?.settings ?? {}) as Record<string, string>;
  vars.invoicePaymentTerms = ts.invoicePaymentTerms || '';
  vars.invoiceFooter = ts.invoiceFooter || '';

  // Generate Stripe payment link if configured
  let paymentUrl = '';
  const [stripeConfig] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'stripe'), eq(integrationConfigs.isEnabled, true)))
    .limit(1);
  const stripeCreds = (stripeConfig?.credentials ?? {}) as Record<string, string>;
  if (stripeCreds.secretKey) {
    try {
      const stripe = new Stripe(stripeCreds.secretKey);
      const balanceCents = invoice.totalCents - invoice.amountPaidCents;
      if (balanceCents > 0) {
        let stripeCustomerId = customer.stripeCustomerId;
        if (!stripeCustomerId) {
          const sc = await stripe.customers.create({
            name: customer.name, email: customer.billingEmail || undefined,
            metadata: { tenantId, customerId: customer.id },
          });
          stripeCustomerId = sc.id;
          await db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, customer.id));
        }
        const session = await stripe.checkout.sessions.create({
          mode: 'payment', customer: stripeCustomerId,
          line_items: [{ price_data: { currency: 'usd', unit_amount: balanceCents, product_data: { name: `Invoice #${invoice.invoiceNumber}` } }, quantity: 1 }],
          metadata: { tenantId, invoiceId, invoiceNumber: String(invoice.invoiceNumber) },
          success_url: `${vars.businessEmail ? 'https://portal.rivertowntechnology.com' : 'https://psa.rivertowntechnology.com'}/billing/invoices/${invoiceId}?payment=success`,
          cancel_url: `${vars.businessEmail ? 'https://portal.rivertowntechnology.com' : 'https://psa.rivertowntechnology.com'}/billing/invoices/${invoiceId}?payment=cancelled`,
        });
        paymentUrl = session.url || '';
        await db.update(invoices).set({ stripeInvoiceId: session.id, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
      }
    } catch (err) { console.error('[STRIPE] Payment link creation failed:', err); }
  }
  vars.paymentUrl = paymentUrl;

  const template = await getTemplate(db, tenantId, 'invoice_sent');

  let subject: string, html: string;
  if (template) {
    subject = renderTemplate(template.subject, vars);
    html = renderTemplate(template.bodyHtml, vars);
  } else {
    subject = `Invoice #${invoice.invoiceNumber} — $${formatCents(invoice.totalCents)} due ${invoice.dueDate}`;
    html = `<p>Please find attached Invoice #${invoice.invoiceNumber} for $${formatCents(invoice.totalCents)}, due ${invoice.dueDate}.</p>`;
  }

  // Generate PDF HTML attachment
  const pdfHtml = generateInvoiceHtml({
    businessName: bv.businessName, businessAddress: bv.businessAddress, businessCity: bv.businessCity,
    businessState: bv.businessState, businessZip: bv.businessZip, businessPhone: bv.businessPhone,
    businessEmail: bv.businessEmail, businessLogo: bv.businessLogo, businessWebsite: '',
    customerName: customer.name, customerAddress: customer.address ?? undefined,
    customerCity: customer.city ?? undefined, customerState: customer.state ?? undefined,
    customerZip: customer.zip ?? undefined, customerEmail: customer.billingEmail ?? undefined,
    customerPhone: customer.phone ?? undefined,
    invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
    notes: invoice.notes ?? '',
    lineItems: lineItemRows.map(li => ({
      description: li.description, quantity: li.quantity ?? '1',
      unitPrice: (li.unitPriceCents / 100).toFixed(2), total: (li.totalCents / 100).toFixed(2),
    })),
    subtotal: (invoice.subtotalCents / 100).toFixed(2), tax: (invoice.taxCents / 100).toFixed(2),
    total: (invoice.totalCents / 100).toFixed(2), paid: (invoice.amountPaidCents / 100).toFixed(2),
    balance: ((invoice.totalCents - invoice.amountPaidCents) / 100).toFixed(2),
    style: ts.invoiceStyle || 'modern', footer: ts.invoiceFooter || '', paymentTerms: ts.invoicePaymentTerms || '',
  });

  // Add Pay Now button if Stripe payment URL is available
  if (paymentUrl) {
    html += `<div style="text-align:center;margin:24px 0">
      <a href="${paymentUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Pay Now — $${formatCents(invoice.totalCents - invoice.amountPaidCents)}</a>
    </div>`;
  }

  // Generate PDF attachment
  let attachments;
  try {
    const pdfBuffer = await htmlToPdf(pdfHtml);
    attachments = [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
  } catch (err) {
    console.error('[PDF] Invoice PDF generation failed, sending without attachment:', err);
  }

  return sendBillingEmail(db, tenantId, { to: customer.billingEmail, subject, html, attachments });
}

// --- Quote Email ---

export async function sendQuoteEmailWithTemplate(db: Database, tenantId: string, quoteId: string): Promise<boolean> {
  const [quote] = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))).limit(1);
  if (!quote) return false;

  const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId)).limit(1);
  if (!customer?.billingEmail) return false;

  let contact = null;
  if (quote.contactId) {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, quote.contactId)).limit(1);
    contact = c ?? null;
  }

  const lineItemRows = await db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId)).orderBy(quoteLineItems.sortOrder);

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer, contact),
    quoteNumber: String(quote.quoteNumber),
    quoteTitle: quote.title,
    quoteSummary: quote.summary ?? '',
    totalFormatted: formatCents(quote.totalCents),
    validUntil: quote.validUntil ?? '',
  };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const ts = (tenant?.settings ?? {}) as Record<string, string>;
  vars.quoteFooter = ts.quoteFooter || '';

  const template = await getTemplate(db, tenantId, 'quote_sent');

  let subject: string, html: string;
  if (template) {
    subject = renderTemplate(template.subject, vars);
    html = renderTemplate(template.bodyHtml, vars);
  } else {
    subject = `Quote #${quote.quoteNumber}: ${quote.title}`;
    html = `<p>Please find attached Quote #${quote.quoteNumber} for $${formatCents(quote.totalCents)}.</p>`;
  }

  // Generate PDF HTML attachment
  const bv = vars;
  const pdfHtml = generateQuoteHtml({
    businessName: bv.businessName, businessAddress: bv.businessAddress, businessCity: bv.businessCity,
    businessState: bv.businessState, businessZip: bv.businessZip, businessPhone: bv.businessPhone,
    businessEmail: bv.businessEmail, businessLogo: bv.businessLogo,
    customerName: customer.name, customerAddress: customer.address ?? undefined,
    customerCity: customer.city ?? undefined, customerState: customer.state ?? undefined,
    customerZip: customer.zip ?? undefined, customerEmail: customer.billingEmail ?? undefined,
    customerPhone: customer.phone ?? undefined,
    quoteNumber: quote.quoteNumber, title: quote.title, summary: quote.summary ?? '',
    validUntil: quote.validUntil ?? '',
    lineItems: lineItemRows.map(li => ({
      description: li.description, quantity: li.quantity ?? '1',
      unitPrice: (li.unitPriceCents / 100).toFixed(2),
      total: ((li.unitPriceCents * parseFloat(li.quantity ?? '1')) / 100).toFixed(2),
    })),
    subtotal: (quote.subtotalCents / 100).toFixed(2), tax: (quote.taxCents / 100).toFixed(2),
    total: (quote.totalCents / 100).toFixed(2),
    style: ts.quoteStyle || 'modern', footer: ts.quoteFooter || '',
  });

  // Generate PDF attachment
  let attachments;
  try {
    const pdfBuffer = await htmlToPdf(pdfHtml);
    attachments = [{ filename: `Quote-${quote.quoteNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
  } catch (err) {
    console.error('[PDF] Quote PDF generation failed, sending without attachment:', err);
  }

  return sendBillingEmail(db, tenantId, { to: customer.billingEmail, subject, html, attachments });
}

// --- Payment Receipt Email ---

export async function sendPaymentReceiptEmail(db: Database, tenantId: string, invoiceId: string, paymentAmountCents: number): Promise<boolean> {
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);
  if (!invoice) return false;

  const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
  if (!customer?.billingEmail) return false;

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer),
    invoiceNumber: String(invoice.invoiceNumber),
    amountFormatted: formatCents(paymentAmountCents),
    totalFormatted: formatCents(invoice.totalCents),
  };

  const template = await getTemplate(db, tenantId, 'invoice_paid');

  let subject: string, html: string;
  if (template) {
    subject = renderTemplate(template.subject, vars);
    html = renderTemplate(template.bodyHtml, vars);
  } else {
    subject = `Payment received — Invoice #${invoice.invoiceNumber}`;
    html = `<p>Thank you! Payment of $${formatCents(paymentAmountCents)} received for Invoice #${invoice.invoiceNumber}.</p>`;
  }

  return sendBillingEmail(db, tenantId, { to: customer.billingEmail, subject, html });
}
