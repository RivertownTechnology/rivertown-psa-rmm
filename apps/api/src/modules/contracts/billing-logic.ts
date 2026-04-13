/**
 * Time-entry resolver — the single source of truth for billability.
 *
 * Given a tenant + ticket + duration + optional caller hints (chosen line item,
 * internal classification, non-billable reason), this function decides:
 *   - which contract + line item the entry attaches to
 *   - what classification it gets (covered | billable | overage | internal)
 *   - what cost rate and bill rate to snapshot
 *   - what dollar amounts to materialize
 *   - whether a single entry should be split into a covered + overage pair
 *
 * Snapshots and the block-balance check run inside a single transaction with
 * `SELECT ... FOR UPDATE` on the line item row, so two concurrent writers can't
 * both consume the last hour of a block.
 *
 * Callers pass a transaction-scoped `tx`. The route handler must wrap this call
 * in `db.transaction(async (tx) => { ... })`.
 */
import { eq, and, sql } from 'drizzle-orm';
import {
  tickets,
  contracts,
  contractLineItems,
  ticketTimeEntries,
  users,
  tenants,
} from '@rivertown/db';
import type { Database } from '@rivertown/db';
import type {
  CoveragePolicy,
  TimeEntryClassification,
  InternalCategory,
  NonBillableReason,
} from '@rivertown/shared';

export interface ResolveInput {
  tenantId: string;
  ticketId: string;
  userId: string;
  durationMinutes: number;
  contractLineItemId?: string;          // tech override
  classification?: TimeEntryClassification; // tech wants to mark as 'internal' for example
  internalCategory?: InternalCategory;       // required when classification='internal'
  nonBillableReason?: NonBillableReason;     // demotes billable→covered ($0)
}

/**
 * One row to be inserted into ticket_time_entries.
 * Resolver returns either one or two rows (the second is the overage portion of a block).
 */
export interface ResolvedEntry {
  contractId: string | null;
  contractLineItemId: string | null;
  classification: TimeEntryClassification;
  internalCategory: InternalCategory | null;
  nonBillableReason: NonBillableReason | null;
  durationMinutes: number;
  costRateCents: number;
  billRateCents: number | null;
  costCents: number;
  billableCents: number;
  isBillable: boolean;          // legacy mirror
  rateCents: number | null;     // legacy mirror
}

export interface ResolveResult {
  entries: ResolvedEntry[];
  reason:
    | 'internal'
    | 'inclusive'
    | 'billable'
    | 'block_covered'
    | 'block_overage_billed'
    | 'block_overage_split'
    | 'block_overage_rejected'
    | 'no_contract';
  warning?: { type: 'warn_threshold' | 'block_exhausted'; lineItemId: string; remainingHours: number };
}

export class ResolveError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const minutesToHours = (m: number) => m / 60;
const hoursToCents = (hours: number, ratePerHourCents: number) =>
  Math.round(hours * ratePerHourCents);

/**
 * Computes live block balance from the materialized used counter PLUS any
 * unbilled consumption since the last cache rebuild. We trust blockHoursUsed
 * as the cache and recompute on demand here for safety.
 *
 * Returns remaining hours (can be negative if over).
 */
async function liveBlockBalanceHours(
  tx: Database,
  lineItem: { id: string; blockHours: string | null; tenantId: string },
): Promise<number> {
  const totalBlock = parseFloat(lineItem.blockHours ?? '0');
  if (totalBlock <= 0) return 0;

  const [row] = await tx
    .select({
      usedMinutes: sql<number>`COALESCE(SUM(${ticketTimeEntries.durationMinutes}), 0)`.as('used_minutes'),
    })
    .from(ticketTimeEntries)
    .where(
      and(
        eq(ticketTimeEntries.tenantId, lineItem.tenantId),
        eq(ticketTimeEntries.contractLineItemId, lineItem.id),
        sql`${ticketTimeEntries.classification} IN ('covered', 'overage')`,
        // Comms-flagged entries don't decrement block balance — see design note.
        sql`${ticketTimeEntries.nonBillableReason} IS NULL`,
      ),
    );

  const usedHours = minutesToHours(Number(row?.usedMinutes ?? 0));
  return totalBlock - usedHours;
}

export async function resolveTimeEntry(
  tx: Database,
  input: ResolveInput,
): Promise<ResolveResult> {
  const {
    tenantId,
    ticketId,
    userId,
    durationMinutes,
    contractLineItemId: pickedLineItemId,
    classification: requestedClassification,
    internalCategory,
    nonBillableReason,
  } = input;

  if (durationMinutes <= 0) {
    throw new ResolveError('invalid_duration', 'durationMinutes must be > 0');
  }

  // Snapshot rates from user + tenant
  const [userRow] = await tx
    .select({
      internalCostCents: users.internalCostCents,
      billableRateCents: users.billableRateCents,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  const [tenantRow] = await tx
    .select({
      defaultInternalCostCents: tenants.defaultInternalCostCents,
      defaultBillableRateCents: tenants.defaultBillableRateCents,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenantRow) throw new ResolveError('tenant_not_found', `tenant ${tenantId} not found`);

  const costRateCents =
    userRow?.internalCostCents ?? tenantRow.defaultInternalCostCents ?? 7500;
  const userBillRateCents =
    userRow?.billableRateCents ?? tenantRow.defaultBillableRateCents ?? 15000;

  // ---------- INTERNAL classification short-circuit ----------
  if (requestedClassification === 'internal') {
    if (!internalCategory) {
      throw new ResolveError(
        'internal_category_required',
        'internalCategory is required when classification=internal',
      );
    }
    // Find the per-tenant Internal contract (seeded by ensureInternalContract).
    const [internalCustomer] = await tx
      .select({ id: contracts.id, defaultLaborLineItemId: contracts.defaultLaborLineItemId })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.name, 'Internal Operations')))
      .limit(1);

    if (!internalCustomer || !internalCustomer.defaultLaborLineItemId) {
      throw new ResolveError(
        'internal_contract_missing',
        'Internal contract not seeded for this tenant — run ensureInternalContract',
      );
    }

    const costCents = hoursToCents(minutesToHours(durationMinutes), costRateCents);
    return {
      reason: 'internal',
      entries: [
        {
          contractId: internalCustomer.id,
          contractLineItemId: internalCustomer.defaultLaborLineItemId,
          classification: 'internal',
          internalCategory,
          nonBillableReason: null,
          durationMinutes,
          costRateCents,
          billRateCents: null,
          costCents,
          billableCents: 0,
          isBillable: false,
          rateCents: null,
        },
      ],
    };
  }

  // ---------- Resolve contract from ticket ----------
  const [ticket] = await tx
    .select({ contractId: tickets.contractId, customerId: tickets.customerId })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1);

  if (!ticket) throw new ResolveError('ticket_not_found', `ticket ${ticketId} not found`);

  let contractId: string | null = ticket.contractId ?? null;

  // If the picked line item belongs to a different contract, that wins (and we
  // fix up the ticket's contractId via the route layer if the caller asks).
  if (pickedLineItemId) {
    const [pickedLine] = await tx
      .select({ contractId: contractLineItems.contractId })
      .from(contractLineItems)
      .where(
        and(
          eq(contractLineItems.id, pickedLineItemId),
          eq(contractLineItems.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!pickedLine) {
      throw new ResolveError('line_item_not_found', `line item ${pickedLineItemId} not found`);
    }
    contractId = pickedLine.contractId;
  }

  if (!contractId) {
    // Caller must either pass contractLineItemId, or set classification='internal',
    // or attach a contract to the ticket first. Reject so we never write an orphan.
    throw new ResolveError(
      'no_contract',
      'Ticket has no contract and no contractLineItemId was provided. Pick a contract line item or mark this entry as internal.',
    );
  }

  // ---------- Resolve line item (lock it for FOR UPDATE) ----------
  let lineItemId = pickedLineItemId;
  if (!lineItemId) {
    const [contract] = await tx
      .select({ defaultLaborLineItemId: contracts.defaultLaborLineItemId })
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, tenantId)))
      .limit(1);
    if (!contract?.defaultLaborLineItemId) {
      throw new ResolveError(
        'no_default_labor_line',
        'Contract has no defaultLaborLineItemId. Set one or pass contractLineItemId.',
      );
    }
    lineItemId = contract.defaultLaborLineItemId;
  }

  // FOR UPDATE serializes concurrent block consumers
  const lockedRows = await tx.execute(sql`
    SELECT id, tenant_id AS "tenantId", coverage_policy AS "coveragePolicy",
           block_hours AS "blockHours", overage_rate_cents AS "overageRateCents",
           unit_price_cents AS "unitPriceCents", warn_at_pct AS "warnAtPct",
           expires_at AS "expiresAt"
    FROM contract_line_items
    WHERE id = ${lineItemId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `);
  const lockedArr = (lockedRows as unknown as { rows?: any[] }).rows ?? (lockedRows as any);
  const lineItem = Array.isArray(lockedArr) ? lockedArr[0] : null;
  if (!lineItem) {
    throw new ResolveError('line_item_not_found', `line item ${lineItemId} not found`);
  }

  // Expired one-time block
  if (lineItem.expiresAt && new Date(lineItem.expiresAt) < new Date()) {
    throw new ResolveError(
      'line_item_expired',
      'This block contract line has expired. Use a different line item or extend expiresAt.',
    );
  }

  const policy = lineItem.coveragePolicy as CoveragePolicy;
  const billRateCents = lineItem.unitPriceCents ?? userBillRateCents;
  const totalBlockHours = parseFloat(lineItem.blockHours ?? '0');
  const durationHours = minutesToHours(durationMinutes);
  const costCents = hoursToCents(durationHours, costRateCents);

  // ---------- Apply policy ----------
  if (policy === 'inclusive') {
    return {
      reason: 'inclusive',
      entries: [
        {
          contractId,
          contractLineItemId: lineItemId,
          classification: 'covered',
          internalCategory: null,
          nonBillableReason: nonBillableReason ?? null,
          durationMinutes,
          costRateCents,
          billRateCents: null,
          costCents,
          billableCents: 0,
          isBillable: false,
          rateCents: null,
        },
      ],
    };
  }

  if (policy === 'billable') {
    // nonBillableReason demotes a billable entry to $0 (still cost-tracked).
    const isFree = !!nonBillableReason;
    return {
      reason: 'billable',
      entries: [
        {
          contractId,
          contractLineItemId: lineItemId,
          classification: isFree ? 'covered' : 'billable',
          internalCategory: null,
          nonBillableReason: nonBillableReason ?? null,
          durationMinutes,
          costRateCents,
          billRateCents,
          costCents,
          billableCents: isFree ? 0 : hoursToCents(durationHours, billRateCents),
          isBillable: !isFree,
          rateCents: isFree ? null : billRateCents,
        },
      ],
    };
  }

  // policy === 'block'
  // Comms-flagged entries don't decrement block — they're a freebie.
  if (nonBillableReason) {
    return {
      reason: 'block_covered',
      entries: [
        {
          contractId,
          contractLineItemId: lineItemId,
          classification: 'covered',
          internalCategory: null,
          nonBillableReason,
          durationMinutes,
          costRateCents,
          billRateCents: null,
          costCents,
          billableCents: 0,
          isBillable: false,
          rateCents: null,
        },
      ],
    };
  }

  const remainingHours = await liveBlockBalanceHours(tx, {
    id: lineItemId,
    blockHours: lineItem.blockHours,
    tenantId,
  });

  // Fully covered by remaining block
  if (durationHours <= remainingHours) {
    const newBalance = remainingHours - durationHours;
    const warnPct = lineItem.warnAtPct ?? 80;
    const warnRemainingThreshold = totalBlockHours * (1 - warnPct / 100);
    const warning =
      totalBlockHours > 0 && newBalance <= warnRemainingThreshold
        ? ({ type: 'warn_threshold' as const, lineItemId, remainingHours: newBalance })
        : undefined;
    return {
      reason: 'block_covered',
      warning,
      entries: [
        {
          contractId,
          contractLineItemId: lineItemId,
          classification: 'covered',
          internalCategory: null,
          nonBillableReason: null,
          durationMinutes,
          costRateCents,
          billRateCents: null,
          costCents,
          billableCents: 0,
          isBillable: false,
          rateCents: null,
        },
      ],
    };
  }

  // Overage path
  const overageRate = lineItem.overageRateCents;
  if (overageRate == null) {
    throw new ResolveError(
      'block_overage_rejected',
      `Block exhausted (${remainingHours.toFixed(2)}h remaining, ${durationHours.toFixed(2)}h requested). Overage not allowed on this contract — set overageRateCents on the line item, or charge to a different line.`,
    );
  }

  // Fully overage — no block left at all
  if (remainingHours <= 0) {
    return {
      reason: 'block_overage_billed',
      warning: { type: 'block_exhausted', lineItemId, remainingHours: 0 },
      entries: [
        {
          contractId,
          contractLineItemId: lineItemId,
          classification: 'overage',
          internalCategory: null,
          nonBillableReason: null,
          durationMinutes,
          costRateCents,
          billRateCents: overageRate,
          costCents,
          billableCents: hoursToCents(durationHours, overageRate),
          isBillable: true,
          rateCents: overageRate,
        },
      ],
    };
  }

  // Split: covered portion + overage portion
  const coveredHours = remainingHours;
  const overageHours = durationHours - remainingHours;
  const coveredMinutes = Math.round(coveredHours * 60);
  const overageMinutes = durationMinutes - coveredMinutes;

  return {
    reason: 'block_overage_split',
    warning: { type: 'block_exhausted', lineItemId, remainingHours: 0 },
    entries: [
      {
        contractId,
        contractLineItemId: lineItemId,
        classification: 'covered',
        internalCategory: null,
        nonBillableReason: null,
        durationMinutes: coveredMinutes,
        costRateCents,
        billRateCents: null,
        costCents: hoursToCents(coveredHours, costRateCents),
        billableCents: 0,
        isBillable: false,
        rateCents: null,
      },
      {
        contractId,
        contractLineItemId: lineItemId,
        classification: 'overage',
        internalCategory: null,
        nonBillableReason: null,
        durationMinutes: overageMinutes,
        costRateCents,
        billRateCents: overageRate,
        costCents: hoursToCents(overageHours, costRateCents),
        billableCents: hoursToCents(overageHours, overageRate),
        isBillable: true,
        rateCents: overageRate,
      },
    ],
  };
}
