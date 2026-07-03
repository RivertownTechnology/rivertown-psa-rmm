import { eq, and, sql } from 'drizzle-orm';
import { tenants, contracts, contractLineItems, invoices, invoiceLineItems, tenantSequences, customers, accountCredits } from '@rivertown/db';
import { recalcInvoiceTotals } from '../modules/invoices/routes.js';

export function startInvoiceAutoSendScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const allTenants = await db.select({ id: tenants.id, settings: tenants.settings }).from(tenants);

      for (const tenant of allTenants) {
        const settings = (tenant.settings ?? {}) as Record<string, unknown>;

        // Skip tenants without auto-send enabled
        if (!settings.invoiceAutoSendEnabled) continue;

        try {
          const now = new Date();
          const todayDayOfMonth = now.getDate();

          // Get all active contracts for this tenant
          const activeContracts = await db.select().from(contracts)
            .where(and(eq(contracts.tenantId, tenant.id), eq(contracts.status, 'active')));

          for (const contract of activeContracts) {
            try {
              // Derive billing day from the contract's start date, clamped to the number
              // of days in the current month so contracts starting on the 29th-31st still
              // bill in shorter months (e.g. a 31st contract bills on Feb 28/29).
              const startDate = new Date(contract.startDate + 'T00:00:00');
              const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const billingDay = Math.min(startDate.getDate(), daysInCurrentMonth);
              if (billingDay !== todayDayOfMonth) continue;

              // Only process monthly billing cycle contracts
              if (contract.billingCycle && contract.billingCycle !== 'monthly') continue;

              // Check if we already generated an invoice for THIS contract today.
              // The invoices table has no contractId column, so we tag each auto-generated
              // invoice's notes with a deterministic marker and dedup on (issueDate, marker).
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const contractMarker = `[auto:${contract.id}]`;
              const existing = await db.select({ id: invoices.id }).from(invoices)
                .where(and(
                  eq(invoices.tenantId, tenant.id),
                  eq(invoices.issueDate, todayStr),
                  sql`${invoices.notes} LIKE ${'%' + contractMarker + '%'}`,
                )).limit(1);

              if (existing.length > 0) continue; // Already generated for this contract today

              // Get line items for this contract
              const lineItems = await db.select().from(contractLineItems)
                .where(eq(contractLineItems.contractId, contract.id))
                .orderBy(contractLineItems.sortOrder, contractLineItems.createdAt);

              if (lineItems.length === 0) continue;

              // Get next invoice number
              const [seqResult] = await db
                .update(tenantSequences)
                .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
                .where(and(
                  eq(tenantSequences.tenantId, tenant.id),
                  eq(tenantSequences.sequenceName, 'invoice'),
                ))
                .returning({ value: tenantSequences.currentValue });

              if (!seqResult) continue;

              const invoiceNumber = parseInt(seqResult.value, 10);

              // Calculate dates
              const dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + 30);
              const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;

              const serviceMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const servicePeriod = `${serviceMonthNames[dueDate.getMonth()]} ${dueDate.getFullYear()}`;

              // Calculate subtotal
              let subtotalCents = 0;
              const invoiceLines: { description: string; quantity: string; unitPriceCents: number; totalCents: number; unitCostCents: number | null; catalogItemId: string | null }[] = [];

              for (const li of lineItems) {
                const qty = parseFloat(li.quantity ?? '1');
                const lineTotal = Math.round(li.unitPriceCents * qty);
                subtotalCents += lineTotal;
                invoiceLines.push({
                  description: li.description,
                  quantity: li.quantity ?? '1',
                  unitPriceCents: li.unitPriceCents,
                  totalCents: lineTotal,
                  unitCostCents: li.unitCostCents ?? null,
                  catalogItemId: li.catalogItemId ?? null,
                });
              }

              const totalCents = subtotalCents;

              // Create invoice
              const [invoice] = await db.insert(invoices).values({
                tenantId: tenant.id,
                customerId: contract.customerId,
                invoiceNumber,
                status: 'draft',
                issueDate: todayStr,
                dueDate: dueDateStr,
                subtotalCents,
                taxCents: 0,
                totalCents,
                amountPaidCents: 0,
                notes: `Services for ${servicePeriod} — ${contract.name} ${contractMarker}`,
              }).returning();

              // Create invoice line items
              for (const line of invoiceLines) {
                await db.insert(invoiceLineItems).values({
                  tenantId: tenant.id,
                  invoiceId: invoice.id,
                  description: line.description,
                  quantity: line.quantity,
                  unitPriceCents: line.unitPriceCents,
                  totalCents: line.totalCents,
                  unitCostCents: line.unitCostCents,
                  catalogItemId: line.catalogItemId,
                });
              }

              // Recalculate totals so auto-generated invoices include tax, matching the
              // manual generate path.
              await recalcInvoiceTotals(db, invoice.id, tenant.id);
              const [freshInvoice] = await db.select().from(invoices)
                .where(and(eq(invoices.id, invoice.id), eq(invoices.tenantId, tenant.id))).limit(1);
              const invoiceTotalCents = freshInvoice?.totalCents ?? totalCents;

              // Auto-apply account credits if customer has a balance
              const [cust] = await db.select().from(customers)
                .where(and(eq(customers.id, contract.customerId), eq(customers.tenantId, tenant.id))).limit(1);
              if (cust && cust.creditBalanceCents > 0) {
                const toApply = Math.min(cust.creditBalanceCents, invoiceTotalCents);
                if (toApply > 0) {
                  const newCreditBal = cust.creditBalanceCents - toApply;
                  await db.insert(accountCredits).values({
                    tenantId: tenant.id, customerId: cust.id, type: 'debit',
                    amountCents: -toApply, balanceAfterCents: newCreditBal,
                    invoiceId: invoice.id, reason: `Auto-applied to Invoice #${invoice.invoiceNumber}`,
                    createdBy: '00000000-0000-0000-0000-000000000000',
                  });
                  await db.update(customers).set({ creditBalanceCents: newCreditBal, updatedAt: new Date() }).where(eq(customers.id, cust.id));
                  const newStatus = toApply >= invoiceTotalCents ? 'paid' : 'draft';
                  await db.update(invoices).set({ creditsAppliedCents: toApply, status: newStatus, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
                }
              }

              // Auto-send the invoice email (fire and forget)
              try {
                const { sendInvoiceEmailWithTemplate } = await import('./document-email.js');
                const sent = await sendInvoiceEmailWithTemplate(db, tenant.id, invoice.id);
                if (sent) {
                  console.log(`[invoice-auto-send] Sent invoice #${invoiceNumber} for contract "${contract.name}" (tenant ${tenant.id})`);
                } else {
                  console.log(`[invoice-auto-send] Generated invoice #${invoiceNumber} but email send failed (tenant ${tenant.id})`);
                }
              } catch (emailErr) {
                console.error(`[invoice-auto-send] Email send error for invoice #${invoiceNumber}:`, emailErr);
              }
            } catch (contractErr) {
              console.error(`[invoice-auto-send] Contract ${contract.id} failed:`, contractErr);
            }
          }
        } catch (err) {
          console.error(`[invoice-auto-send] Tenant ${tenant.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[invoice-auto-send] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000);
}
