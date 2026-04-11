import { eq, and, isNull, inArray } from 'drizzle-orm';
import { integrationConfigs, customers, invoices, invoiceLineItems, payments } from '@rivertown/db';
import { getQBOAuth, qboFetch } from '../modules/integrations/quickbooks.js';

const SYNC_INTERVALS_MS: Record<string, number> = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

// ── Ensure default QBO Item exists ────────────────────────────

async function ensureDefaultItem(
  db: any,
  auth: { accessToken: string; apiBase: string; realmId: string; configId: string },
): Promise<string> {
  // Check if we already have a default item ID cached in settings
  const [config] = await db.select().from(integrationConfigs)
    .where(eq(integrationConfigs.id, auth.configId)).limit(1);

  const settings = (config?.settings ?? {}) as Record<string, string>;
  if (settings.defaultItemId) return settings.defaultItemId;

  // Query QBO for an existing "Services" item
  try {
    const query = encodeURIComponent("SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 1");
    const result = await qboFetch<{ QueryResponse: { Item?: Array<{ Id: string }> } }>(
      auth.accessToken, auth.apiBase, auth.realmId, 'GET',
      `/query?query=${query}`,
    );

    const existing = result.QueryResponse?.Item?.[0];
    if (existing) {
      await db.update(integrationConfigs).set({
        settings: { ...settings, defaultItemId: existing.Id },
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, auth.configId));
      return existing.Id;
    }
  } catch {
    // Query failed — fall through to create
  }

  // Create a default "IT Services" item
  const created = await qboFetch<{ Item: { Id: string } }>(
    auth.accessToken, auth.apiBase, auth.realmId, 'POST',
    '/item',
    {
      Name: 'IT Services',
      Type: 'Service',
      IncomeAccountRef: { value: '1' }, // Default income account
    },
  );

  const itemId = created.Item.Id;
  await db.update(integrationConfigs).set({
    settings: { ...settings, defaultItemId: itemId },
    updatedAt: new Date(),
  }).where(eq(integrationConfigs.id, auth.configId));

  return itemId;
}

// ── Customer Sync ─────────────────────────────────────────────

export async function syncCustomerToQBO(
  db: any,
  tenantId: string,
  customerId: string,
  env: { clientId: string; clientSecret: string; sandbox: boolean },
): Promise<string | null> {
  const auth = await getQBOAuth(db, tenantId, env);
  if (!auth) return null;

  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) return null;

  const qboCustomerPayload: Record<string, unknown> = {
    DisplayName: customer.name,
    CompanyName: customer.name,
    ...(customer.billingEmail ? { PrimaryEmailAddr: { Address: customer.billingEmail } } : {}),
    ...(customer.phone ? { PrimaryPhone: { FreeFormNumber: customer.phone } } : {}),
    BillAddr: {
      ...(customer.address ? { Line1: customer.address } : {}),
      ...(customer.city ? { City: customer.city } : {}),
      ...(customer.state ? { CountrySubDivisionCode: customer.state } : {}),
      ...(customer.zip ? { PostalCode: customer.zip } : {}),
    },
  };

  let qboCustomerId = customer.qboCustomerId;

  if (qboCustomerId) {
    // Update existing QBO customer — need SyncToken
    try {
      const existing = await qboFetch<{ Customer: { Id: string; SyncToken: string } }>(
        auth.accessToken, auth.apiBase, auth.realmId, 'GET',
        `/customer/${qboCustomerId}`,
      );

      await qboFetch(
        auth.accessToken, auth.apiBase, auth.realmId, 'POST',
        '/customer',
        {
          ...qboCustomerPayload,
          Id: qboCustomerId,
          SyncToken: existing.Customer.SyncToken,
          sparse: true,
        },
      );
    } catch (err: any) {
      // If customer doesn't exist in QBO anymore, create a new one
      if (err.message?.includes('404') || err.message?.includes('610')) {
        qboCustomerId = null;
      } else {
        throw err;
      }
    }
  }

  if (!qboCustomerId) {
    // Create new QBO customer
    const created = await qboFetch<{ Customer: { Id: string } }>(
      auth.accessToken, auth.apiBase, auth.realmId, 'POST',
      '/customer',
      qboCustomerPayload,
    );

    qboCustomerId = created.Customer.Id;
  }

  // Store QBO customer ID locally
  await db.update(customers).set({
    qboCustomerId,
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId));

  return qboCustomerId;
}

// ── Invoice Sync ──────────────────────────────────────────────

export async function syncInvoiceToQBO(
  db: any,
  tenantId: string,
  invoiceId: string,
  env?: { clientId: string; clientSecret: string; sandbox: boolean },
): Promise<string | null> {
  // Allow calling without env — load from process.env
  const resolvedEnv = env ?? {
    clientId: process.env.QBO_CLIENT_ID ?? '',
    clientSecret: process.env.QBO_CLIENT_SECRET ?? '',
    sandbox: process.env.QBO_SANDBOX === 'true',
  };

  const auth = await getQBOAuth(db, tenantId, resolvedEnv);
  if (!auth) return null;

  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
    .limit(1);

  if (!invoice) return null;

  // Already synced — skip
  if (invoice.qboInvoiceId) return invoice.qboInvoiceId;

  // Ensure customer is synced first
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);

  if (!customer) return null;

  let qboCustomerId = customer.qboCustomerId;
  if (!qboCustomerId) {
    qboCustomerId = await syncCustomerToQBO(db, tenantId, invoice.customerId, resolvedEnv);
    if (!qboCustomerId) return null;
  }

  // Get default item
  const defaultItemId = await ensureDefaultItem(db, auth);

  // Fetch line items
  const lineItems = await db.select().from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.tenantId, tenantId)))
    .orderBy(invoiceLineItems.sortOrder);

  // Build QBO invoice lines
  const qboLines = lineItems.map((li: any) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: li.totalCents / 100,
    Description: li.description,
    SalesItemLineDetail: {
      Qty: parseFloat(li.quantity ?? '1'),
      UnitPrice: li.unitPriceCents / 100,
      ItemRef: { value: defaultItemId },
    },
  }));

  // Build QBO invoice
  const qboInvoice: Record<string, unknown> = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: String(invoice.invoiceNumber),
    TxnDate: invoice.issueDate,
    DueDate: invoice.dueDate,
    Line: qboLines,
    GlobalTaxCalculation: 'NotApplicable',
    ...(invoice.notes ? { PrivateNote: invoice.notes.substring(0, 4000) } : {}),
  };

  // Pass pre-calculated tax from PSA
  if (invoice.taxCents > 0) {
    qboInvoice.TxnTaxDetail = {
      TotalTax: invoice.taxCents / 100,
    };
  }

  const created = await qboFetch<{ Invoice: { Id: string } }>(
    auth.accessToken, auth.apiBase, auth.realmId, 'POST',
    '/invoice',
    qboInvoice,
  );

  const qboInvoiceId = created.Invoice.Id;

  // Store QBO invoice ID locally
  await db.update(invoices).set({
    qboInvoiceId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId));

  return qboInvoiceId;
}

// ── Payment Sync ──────────────────────────────────────────────

export async function syncPaymentToQBO(
  db: any,
  tenantId: string,
  paymentId: string,
  env?: { clientId: string; clientSecret: string; sandbox: boolean },
): Promise<string | null> {
  const resolvedEnv = env ?? {
    clientId: process.env.QBO_CLIENT_ID ?? '',
    clientSecret: process.env.QBO_CLIENT_SECRET ?? '',
    sandbox: process.env.QBO_SANDBOX === 'true',
  };

  const auth = await getQBOAuth(db, tenantId, resolvedEnv);
  if (!auth) return null;

  const [payment] = await db.select().from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
    .limit(1);

  if (!payment) return null;

  // Already synced — skip
  if (payment.qboPaymentId) return payment.qboPaymentId;

  // Ensure invoice is synced first
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, payment.invoiceId), eq(invoices.tenantId, tenantId))).limit(1);

  if (!invoice) return null;

  let qboInvoiceId = invoice.qboInvoiceId;
  if (!qboInvoiceId) {
    qboInvoiceId = await syncInvoiceToQBO(db, tenantId, payment.invoiceId, resolvedEnv);
    if (!qboInvoiceId) return null;
  }

  // Get the customer's QBO ID
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);

  if (!customer?.qboCustomerId) return null;

  const paidAtDate = new Date(payment.paidAt).toISOString().split('T')[0];
  const noteparts: string[] = [];
  if (payment.paymentMethod) noteparts.push(payment.paymentMethod);
  if (payment.reference) noteparts.push(payment.reference);
  if (payment.stripePaymentIntentId) noteparts.push(`Stripe: ${payment.stripePaymentIntentId}`);

  const qboPayment: Record<string, unknown> = {
    CustomerRef: { value: customer.qboCustomerId },
    TotalAmt: payment.amountCents / 100,
    TxnDate: paidAtDate,
    Line: [
      {
        Amount: payment.amountCents / 100,
        LinkedTxn: [
          {
            TxnId: qboInvoiceId,
            TxnType: 'Invoice',
          },
        ],
      },
    ],
    ...(noteparts.length > 0 ? { PrivateNote: noteparts.join(' — ').substring(0, 4000) } : {}),
  };

  const created = await qboFetch<{ Payment: { Id: string } }>(
    auth.accessToken, auth.apiBase, auth.realmId, 'POST',
    '/payment',
    qboPayment,
  );

  const qboPaymentId = created.Payment.Id;

  // Store QBO payment ID locally
  await db.update(payments).set({
    qboPaymentId,
  }).where(eq(payments.id, paymentId));

  return qboPaymentId;
}

// ── Full Sync Orchestrator ────────────────────────────────────

export async function runQBOSyncForTenant(
  db: any,
  tenantId: string,
  env: { clientId: string; clientSecret: string; sandbox: boolean },
): Promise<{ customers: number; invoices: number; payments: number }> {
  const auth = await getQBOAuth(db, tenantId, env);
  if (!auth) throw new Error('QuickBooks is not connected.');

  let customerCount = 0;
  let invoiceCount = 0;
  let paymentCount = 0;

  // 1. Sync all customers that don't have a qboCustomerId
  const unsyncedCustomers = await db.select().from(customers)
    .where(and(
      eq(customers.tenantId, tenantId),
      isNull(customers.qboCustomerId),
      eq(customers.status, 'active'),
    ));

  for (const c of unsyncedCustomers) {
    try {
      await syncCustomerToQBO(db, tenantId, c.id, env);
      customerCount++;
    } catch (err) {
      console.error(`[QBO-SYNC] Customer ${c.id} failed:`, err);
    }
  }

  // 2. Sync all sent/partial/paid/overdue invoices that don't have a qboInvoiceId
  const unsyncedInvoices = await db.select().from(invoices)
    .where(and(
      eq(invoices.tenantId, tenantId),
      isNull(invoices.qboInvoiceId),
      inArray(invoices.status, ['sent', 'viewed', 'partial', 'paid', 'overdue']),
    ));

  for (const inv of unsyncedInvoices) {
    try {
      await syncInvoiceToQBO(db, tenantId, inv.id, env);
      invoiceCount++;
    } catch (err) {
      console.error(`[QBO-SYNC] Invoice ${inv.id} failed:`, err);
    }
  }

  // 3. Sync all payments that don't have a qboPaymentId
  const unsyncedPayments = await db.select().from(payments)
    .where(and(
      eq(payments.tenantId, tenantId),
      isNull(payments.qboPaymentId),
    ));

  for (const pmt of unsyncedPayments) {
    try {
      await syncPaymentToQBO(db, tenantId, pmt.id, env);
      paymentCount++;
    } catch (err) {
      console.error(`[QBO-SYNC] Payment ${pmt.id} failed:`, err);
    }
  }

  return { customers: customerCount, invoices: invoiceCount, payments: paymentCount };
}

// ── Background Scheduler ──────────────────────────────────────

export function startQBOSyncScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const configs = await db.select().from(integrationConfigs)
        .where(and(
          eq(integrationConfigs.provider, 'quickbooks'),
          eq(integrationConfigs.isEnabled, true),
        ));

      for (const config of configs) {
        const settings = (config.settings ?? {}) as Record<string, string>;
        const frequency = settings.syncFrequency || 'daily';
        const intervalMs = SYNC_INTERVALS_MS[frequency] ?? SYNC_INTERVALS_MS.daily;

        const lastSync = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
        if (Date.now() - lastSync < intervalMs) continue;
        if (config.syncStatus === 'syncing') continue;

        const creds = (config.credentials ?? {}) as Record<string, string>;
        if (!creds.accessToken || !creds.realmId) continue;

        // Derive env from process.env for scheduler context
        const env = {
          clientId: process.env.QBO_CLIENT_ID ?? '',
          clientSecret: process.env.QBO_CLIENT_SECRET ?? '',
          sandbox: process.env.QBO_SANDBOX === 'true',
        };

        console.log(`[QBO-SYNC] Auto-syncing tenant ${config.tenantId} (frequency: ${frequency})`);

        await db.update(integrationConfigs).set({
          syncStatus: 'syncing', syncError: null, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, config.id));

        try {
          const result = await runQBOSyncForTenant(db, config.tenantId, env);
          console.log(`[QBO-SYNC] Tenant ${config.tenantId}: ${result.customers} customers, ${result.invoices} invoices, ${result.payments} payments`);

          await db.update(integrationConfigs).set({
            syncStatus: 'idle', lastSyncAt: new Date(), syncError: null, updatedAt: new Date(),
          }).where(eq(integrationConfigs.id, config.id));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed';
          console.error(`[QBO-SYNC] Tenant ${config.tenantId} failed:`, err);
          await db.update(integrationConfigs).set({
            syncStatus: 'error', syncError: message, updatedAt: new Date(),
          }).where(eq(integrationConfigs.id, config.id));
        }
      }
    } catch (err) {
      console.error('[QBO-SYNC] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000);
}
