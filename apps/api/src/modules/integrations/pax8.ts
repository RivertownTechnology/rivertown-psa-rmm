import { FastifyInstance } from 'fastify';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import {
  integrationConfigs,
  pax8Subscriptions,
  customers,
  serviceCatalogItems,
  contractLineItems,
  contracts,
} from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';

// ── Proration helper ──────────────────────────────────────────────────

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getDaysRemaining(fromDate: Date): number {
  const totalDays = getDaysInMonth(fromDate);
  const currentDay = fromDate.getDate();
  return totalDays - currentDay;
}

/**
 * Creates a one-time "Partial Month" proration line item on a contract
 * when the quantity increases mid-billing-cycle.
 */
async function createProrationLineItem(
  db: any,
  opts: {
    tenantId: string;
    contractId: string;
    productName: string;
    quantityDelta: number;
    unitPriceCents: number;
    unitCostCents: number;
    category: string;
    changeDate: Date;
  },
) {
  const { tenantId, contractId, productName, quantityDelta, unitPriceCents, unitCostCents, category, changeDate } = opts;

  const daysRemaining = getDaysRemaining(changeDate);
  const totalDays = getDaysInMonth(changeDate);
  const prorationFactor = daysRemaining / totalDays;

  const proratedSellCents = Math.round(unitPriceCents * quantityDelta * prorationFactor);
  const proratedCostCents = Math.round(unitCostCents * quantityDelta * prorationFactor);

  const monthName = changeDate.toLocaleString('en-US', { month: 'short' });
  const dayFrom = changeDate.getDate();
  const dayTo = totalDays;

  const description = `${productName} — Partial Month (${quantityDelta} added, ${monthName} ${dayFrom}–${dayTo})`;

  const [lineItem] = await db.insert(contractLineItems).values({
    tenantId,
    contractId,
    description,
    itemType: 'one_time',
    category,
    unitPriceCents: proratedSellCents,
    unitCostCents: proratedCostCents,
    quantity: '1',
    taxable: true,
  }).returning();

  return lineItem;
}

// ── Pax8 API helpers ──────────────────────────────────────────────────

interface Pax8TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Pax8Company {
  id: string;
  name: string;
  address?: { street?: string; city?: string; stateOrProvince?: string; postalCode?: string; country?: string };
  phone?: string;
  website?: string;
  status?: string;
}

interface Pax8Product {
  id: string;
  name: string;
  vendorName?: string;
  sku?: string;
}

interface Pax8PricingRate {
  partnerBuyRate?: number;
  suggestedRetailPrice?: number;
  startQuantity?: number;
  endQuantity?: number;
}

interface Pax8PricingTier {
  billingTerm?: string;
  unitOfMeasurement?: string;
  rates?: Pax8PricingRate[];
}

// The pricing endpoint returns an array of tiers, or sometimes a single object
type Pax8PricingResponse = Pax8PricingTier[] | Pax8PricingTier;

/**
 * Extract MSRP from Pax8 pricing response.
 * Response shape: { content: [{ billingTerm, rates: [{ partnerBuyRate, suggestedRetailPrice }] }] }
 * Prefers Monthly billing term if multiple tiers exist.
 */
function extractMsrp(data: unknown): number | null {
  if (data == null) return null;
  const obj = data as Record<string, unknown>;

  // Response has a `content` wrapper array
  let tiers: Pax8PricingTier[];
  if (Array.isArray(obj.content)) {
    tiers = obj.content;
  } else if (Array.isArray(data)) {
    tiers = data as Pax8PricingTier[];
  } else {
    tiers = [data as Pax8PricingTier];
  }

  // Prefer the Monthly tier
  const monthly = tiers.find((t) => t.billingTerm === 'Monthly');
  const tier = monthly ?? tiers[0];
  if (!tier?.rates?.length) return null;

  const rate = tier.rates[0];
  return rate.suggestedRetailPrice ?? null;
}

/** Extract partner buy rate (your cost) from Pax8 pricing response. */
function extractPartnerCost(data: unknown): number | null {
  if (data == null) return null;
  const obj = data as Record<string, unknown>;

  let tiers: Pax8PricingTier[];
  if (Array.isArray(obj.content)) {
    tiers = obj.content;
  } else if (Array.isArray(data)) {
    tiers = data as Pax8PricingTier[];
  } else {
    tiers = [data as Pax8PricingTier];
  }

  const monthly = tiers.find((t) => t.billingTerm === 'Monthly');
  const tier = monthly ?? tiers[0];
  if (!tier?.rates?.length) return null;

  return tier.rates[0].partnerBuyRate ?? null;
}

interface Pax8Subscription {
  id: string;
  companyId: string;
  productId: string;
  productName?: string;
  quantity: number;
  price?: number;
  billingTerm?: string;
  startDate?: string;
  status?: string;
  provisioningDetails?: Record<string, unknown>;
}

interface Pax8PagedResponse<T> {
  page: { size: number; totalElements: number; totalPages: number; number: number };
  content: T[];
}

async function getPax8Config(db: any, tenantId: string) {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'pax8')))
    .limit(1);
  return config ?? null;
}

async function getPax8Token(creds: { clientId: string; clientSecret: string }): Promise<string> {
  const res = await fetch('https://login.pax8.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
      audience: 'api://p8p.client',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pax8 auth failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as Pax8TokenResponse;
  return data.access_token;
}

async function pax8Fetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.pax8.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pax8 API error (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

async function getAuthenticatedPax8(db: any, tenantId: string) {
  const config = await getPax8Config(db, tenantId);
  if (!config?.isEnabled) throw new Error('Pax8 integration is not enabled. Configure it in Settings → Integrations.');
  const creds = (config.credentials ?? {}) as Record<string, string>;
  if (!creds.clientId || !creds.clientSecret) throw new Error('Pax8 credentials are not configured.');
  const token = await getPax8Token({ clientId: creds.clientId, clientSecret: creds.clientSecret });
  return { token, config };
}

// ── Routes ────────────────────────────────────────────────────────────

export async function pax8Routes(fastify: FastifyInstance) {
  // ─── Settings ───────────────────────────────────────────────────────

  // GET settings
  fastify.get('/api/v1/settings/pax8', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const config = await getPax8Config(fastify.db, request.tenantId);
    const creds = (config?.credentials ?? {}) as Record<string, string>;
    const settings = (config?.settings ?? {}) as Record<string, string>;
    return {
      isEnabled: config?.isEnabled ?? false,
      clientId: creds.clientId ? '••••••••' + creds.clientId.slice(-4) : '',
      clientSecret: creds.clientSecret ? '••••••••' : '',
      syncFrequency: settings.syncFrequency || 'daily',
      lastSyncAt: config?.lastSyncAt ?? null,
      syncStatus: config?.syncStatus ?? 'idle',
      syncError: config?.syncError ?? null,
    };
  });

  // PUT settings
  fastify.put('/api/v1/settings/pax8', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const body = request.body as { clientId?: string; clientSecret?: string; isEnabled: boolean; syncFrequency?: string };
    const existing = await getPax8Config(fastify.db, request.tenantId);
    const prevCreds = (existing?.credentials ?? {}) as Record<string, string>;
    const prevSettings = (existing?.settings ?? {}) as Record<string, string>;

    const credentials: Record<string, string> = {
      clientId: body.clientId && !body.clientId.startsWith('••') ? body.clientId : prevCreds.clientId || '',
      clientSecret: body.clientSecret && !body.clientSecret.startsWith('••') ? body.clientSecret : prevCreds.clientSecret || '',
    };

    const settings: Record<string, string> = {
      ...prevSettings,
      syncFrequency: body.syncFrequency || prevSettings.syncFrequency || 'daily',
    };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'pax8',
        isEnabled: body.isEnabled, credentials, settings,
      });
    }
    return { success: true };
  });

  // Test connection
  fastify.post('/api/v1/settings/pax8/test', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    try {
      const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);
      // Quick check — fetch first page of companies
      await pax8Fetch<Pax8PagedResponse<Pax8Company>>(token, '/companies?size=1');
      return { success: true, message: 'Connected to Pax8 successfully' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  });

  // ─── Companies (mapping) ──────────────────────────────────────────

  // List Pax8 companies with local mapping status
  fastify.get('/api/v1/pax8/companies', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);
    const params = request.query as { page?: string; size?: string };
    const page = parseInt(params.page ?? '0', 10);
    const size = parseInt(params.size ?? '50', 10);

    const pax8Data = await pax8Fetch<Pax8PagedResponse<Pax8Company>>(token, `/companies?page=${page}&size=${size}`);

    // Get all customers that have a pax8CompanyId
    const mappedCustomers = await fastify.db
      .select({ id: customers.id, name: customers.name, pax8CompanyId: customers.pax8CompanyId })
      .from(customers)
      .where(and(eq(customers.tenantId, request.tenantId), isNotNull(customers.pax8CompanyId)));

    const mappingLookup = new Map(mappedCustomers.map((c) => [c.pax8CompanyId, { customerId: c.id, customerName: c.name }]));

    const companies = pax8Data.content.map((co) => ({
      ...co,
      mapped: mappingLookup.has(co.id),
      customerId: mappingLookup.get(co.id)?.customerId ?? null,
      customerName: mappingLookup.get(co.id)?.customerName ?? null,
    }));

    return { companies, page: pax8Data.page };
  });

  // Map a Pax8 company to a local customer
  fastify.post('/api/v1/pax8/companies/:pax8CompanyId/map', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { pax8CompanyId } = request.params as { pax8CompanyId: string };
    const { customerId } = request.body as { customerId: string };

    // Clear any existing mapping to this Pax8 company
    await fastify.db.update(customers).set({ pax8CompanyId: null, updatedAt: new Date() })
      .where(and(eq(customers.tenantId, request.tenantId), eq(customers.pax8CompanyId, pax8CompanyId)));

    // Set new mapping
    await fastify.db.update(customers).set({ pax8CompanyId, updatedAt: new Date() })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, request.tenantId)));

    // Also update any existing pax8Subscriptions for this company to link to the customer
    await fastify.db.update(pax8Subscriptions).set({ customerId, updatedAt: new Date() })
      .where(and(eq(pax8Subscriptions.tenantId, request.tenantId), eq(pax8Subscriptions.pax8CompanyId, pax8CompanyId)));

    return { success: true };
  });

  // Unmap a Pax8 company
  fastify.post('/api/v1/pax8/companies/:pax8CompanyId/unmap', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { pax8CompanyId } = request.params as { pax8CompanyId: string };

    await fastify.db.update(customers).set({ pax8CompanyId: null, updatedAt: new Date() })
      .where(and(eq(customers.tenantId, request.tenantId), eq(customers.pax8CompanyId, pax8CompanyId)));

    return { success: true };
  });

  // ─── Products ─────────────────────────────────────────────────────

  // List Pax8 products (for import to catalog)
  fastify.get('/api/v1/pax8/products', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);
    const params = request.query as { page?: string; size?: string; vendorName?: string };
    const page = parseInt(params.page ?? '0', 10);
    const size = parseInt(params.size ?? '50', 10);
    let url = `/products?page=${page}&size=${size}`;
    if (params.vendorName) url += `&vendorName=${encodeURIComponent(params.vendorName)}`;

    const pax8Data = await pax8Fetch<Pax8PagedResponse<Pax8Product>>(token, url);

    // Check which products already exist in our catalog
    const existingItems = await fastify.db
      .select({ pax8ProductId: serviceCatalogItems.pax8ProductId })
      .from(serviceCatalogItems)
      .where(and(eq(serviceCatalogItems.tenantId, request.tenantId), isNotNull(serviceCatalogItems.pax8ProductId)));

    const existingIds = new Set(existingItems.map((i) => i.pax8ProductId));

    const products = pax8Data.content.map((p) => ({
      ...p,
      inCatalog: existingIds.has(p.id),
    }));

    return { products, page: pax8Data.page };
  });

  // Import a Pax8 product into the service catalog
  fastify.post('/api/v1/pax8/products/:productId/import', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const body = request.body as {
      name?: string;
      category?: string;
      itemType?: string;
      defaultUnitPriceCents?: number;
      defaultUnitCostCents?: number;
    };

    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);
    const product = await pax8Fetch<Pax8Product>(token, `/products/${productId}`);

    // Check if already imported
    const [existing] = await fastify.db
      .select()
      .from(serviceCatalogItems)
      .where(and(eq(serviceCatalogItems.tenantId, request.tenantId), eq(serviceCatalogItems.pax8ProductId, productId)))
      .limit(1);

    if (existing) {
      return { catalogItem: existing, alreadyExisted: true };
    }

    const [catalogItem] = await fastify.db.insert(serviceCatalogItems).values({
      tenantId: request.tenantId,
      name: body.name || product.name,
      category: body.category || 'license',
      itemType: body.itemType || 'recurring',
      defaultUnitPriceCents: body.defaultUnitPriceCents ?? 0,
      defaultUnitCostCents: body.defaultUnitCostCents ?? 0,
      vendor: product.vendorName || undefined,
      sku: product.sku || undefined,
      pax8ProductId: product.id,
      pax8ProductName: product.name,
      pax8VendorName: product.vendorName || undefined,
    }).returning();

    reply.code(201);
    return { catalogItem, alreadyExisted: false };
  });

  // ─── Subscriptions ────────────────────────────────────────────────

  // List Pax8 subscriptions for a company (syncs to local cache)
  fastify.get('/api/v1/pax8/companies/:pax8CompanyId/subscriptions', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { pax8CompanyId } = request.params as { pax8CompanyId: string };
    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);

    // Fetch subscriptions from Pax8
    const pax8Data = await pax8Fetch<Pax8PagedResponse<Pax8Subscription>>(
      token,
      `/subscriptions?companyId=${pax8CompanyId}&size=200`,
    );

    // Resolve product names + partner cost — Pax8 subscriptions only have productId, not the name
    // NOTE: subscription.price = MSRP (what customer pays). partnerBuyRate from pricing endpoint = your cost.
    const productIds = [...new Set(pax8Data.content.map((s) => s.productId).filter(Boolean))];
    const productNameMap = new Map<string, string>();
    const partnerCostMap = new Map<string, number>(); // partnerBuyRate in cents
    for (const pid of productIds) {
      try {
        const product = await pax8Fetch<Pax8Product>(token, `/products/${pid}`);
        productNameMap.set(pid, product.name);
        // Fetch partner cost
        try {
          const pricingData = await pax8Fetch<unknown>(token, `/products/${pid}/pricing?companyId=${pax8CompanyId}`);
          const cost = extractPartnerCost(pricingData);
          if (cost != null) partnerCostMap.set(pid, Math.round(cost * 100));
        } catch { /* pricing not available for all products */ }
      } catch {
        // Product may be delisted — fall back gracefully
      }
    }

    // Find the mapped customer
    const [customer] = await fastify.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.tenantId, request.tenantId), eq(customers.pax8CompanyId, pax8CompanyId)))
      .limit(1);

    // Upsert into local pax8_subscriptions cache
    for (const sub of pax8Data.content) {
      const resolvedName = productNameMap.get(sub.productId) || sub.productName || 'Unknown Product';

      const [existing] = await fastify.db
        .select()
        .from(pax8Subscriptions)
        .where(and(
          eq(pax8Subscriptions.tenantId, request.tenantId),
          eq(pax8Subscriptions.pax8SubscriptionId, sub.id),
        ))
        .limit(1);

      // sub.price = MSRP (what customer pays). partnerCostMap has your actual cost.
      const rawProductId = sub.productId;
      const partnerCostCents = rawProductId ? partnerCostMap.get(rawProductId) : null;
      // Store partner cost as unitPriceCents (your cost from Pax8)
      const costCents = partnerCostCents ?? (sub.price != null ? Math.round(sub.price * 100) : null);

      const values = {
        pax8CompanyId: sub.companyId,
        customerId: customer?.id ?? null,
        productName: resolvedName,
        quantity: String(sub.quantity ?? 0),
        unitPriceCents: costCents != null ? String(costCents) : null,
        billingTerm: sub.billingTerm ?? null,
        startDate: sub.startDate ?? null,
        status: sub.status ?? null,
        rawData: sub,
        syncedAt: new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        // Check for quantity increase on linked line items — create proration
        if (existing.contractLineItemId) {
          const oldQty = parseFloat(existing.quantity ?? '0');
          const newQty = sub.quantity ?? 0;
          const qtyDelta = newQty - oldQty;

          if (qtyDelta > 0) {
            const [linkedLi] = await fastify.db
              .select({ contractId: contractLineItems.contractId, unitPriceCents: contractLineItems.unitPriceCents, category: contractLineItems.category })
              .from(contractLineItems)
              .where(eq(contractLineItems.id, existing.contractLineItemId))
              .limit(1);

            if (linkedLi) {
              const costPerUnit = costCents ?? 0;
              await createProrationLineItem(fastify.db, {
                tenantId: request.tenantId,
                contractId: linkedLi.contractId,
                productName: resolvedName,
                quantityDelta: qtyDelta,
                unitPriceCents: linkedLi.unitPriceCents,
                unitCostCents: costPerUnit,
                category: linkedLi.category || 'license',
                changeDate: new Date(),
              });
            }
          }

          // Update the recurring line item to the new quantity and cost
          await fastify.db.update(contractLineItems).set({
            unitCostCents: costCents ?? undefined,
            quantity: String(sub.quantity ?? 1),
            updatedAt: new Date(),
          }).where(eq(contractLineItems.id, existing.contractLineItemId));
        }

        await fastify.db.update(pax8Subscriptions).set(values).where(eq(pax8Subscriptions.id, existing.id));
      } else {
        await fastify.db.insert(pax8Subscriptions).values({
          tenantId: request.tenantId,
          pax8SubscriptionId: sub.id,
          ...values,
        });
      }
    }

    // Return the freshly cached data with contract link info + catalog sell price
    const localSubs = await fastify.db
      .select()
      .from(pax8Subscriptions)
      .where(and(eq(pax8Subscriptions.tenantId, request.tenantId), eq(pax8Subscriptions.pax8CompanyId, pax8CompanyId)));

    // Load catalog items to match sell prices
    const catalogItems = await fastify.db
      .select({
        pax8ProductName: serviceCatalogItems.pax8ProductName,
        defaultUnitPriceCents: serviceCatalogItems.defaultUnitPriceCents,
      })
      .from(serviceCatalogItems)
      .where(and(eq(serviceCatalogItems.tenantId, request.tenantId), isNotNull(serviceCatalogItems.pax8ProductName)));
    const catalogPriceMap = new Map(catalogItems.map((ci) => [ci.pax8ProductName, ci.defaultUnitPriceCents]));

    // Enrich with contract line item link status and sell price
    const enriched = await Promise.all(
      localSubs.map(async (sub) => {
        let linkedContract: { contractId: string; contractName: string } | null = null;
        // Sell price: catalog price > MSRP from Pax8 subscription price > null
        // sub.rawData.price = MSRP (what customer pays), sub.unitPriceCents = partner cost
        const rawData = (sub.rawData ?? {}) as Record<string, unknown>;
        const subPrice = typeof rawData.price === 'number' ? Math.round(rawData.price * 100) : null;
        const sellPriceCents = catalogPriceMap.get(sub.productName) ?? subPrice;
        if (sub.contractLineItemId) {
          const [li] = await fastify.db
            .select({ contractId: contractLineItems.contractId })
            .from(contractLineItems)
            .where(eq(contractLineItems.id, sub.contractLineItemId))
            .limit(1);
          if (li) {
            const [c] = await fastify.db
              .select({ name: contracts.name })
              .from(contracts)
              .where(eq(contracts.id, li.contractId))
              .limit(1);
            linkedContract = { contractId: li.contractId, contractName: c?.name ?? '' };
          }
        }
        return { ...sub, linkedContract, sellPriceCents };
      }),
    );

    return {
      subscriptions: enriched,
      customer: customer ?? null,
    };
  });

  // Import Pax8 subscriptions into a contract as line items
  fastify.post('/api/v1/pax8/companies/:pax8CompanyId/import-to-contract', {
    preHandler: [fastify.authenticate, requirePermission('contracts:write')],
  }, async (request) => {
    const { pax8CompanyId } = request.params as { pax8CompanyId: string };
    const { contractId, subscriptionIds } = request.body as { contractId: string; subscriptionIds: string[] };

    // Verify contract exists and belongs to tenant
    const [contract] = await fastify.db
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, request.tenantId)))
      .limit(1);
    if (!contract) throw new Error('Contract not found');

    const imported: string[] = [];
    for (const subId of subscriptionIds) {
      const [sub] = await fastify.db
        .select()
        .from(pax8Subscriptions)
        .where(and(
          eq(pax8Subscriptions.tenantId, request.tenantId),
          eq(pax8Subscriptions.pax8SubscriptionId, subId),
          eq(pax8Subscriptions.pax8CompanyId, pax8CompanyId),
        ))
        .limit(1);
      if (!sub) continue;

      // Skip if already linked to a line item
      if (sub.contractLineItemId) continue;

      // sub.unitPriceCents = partner cost (partnerBuyRate). rawData.price = MSRP.
      const unitCostCents = sub.unitPriceCents ? parseInt(sub.unitPriceCents, 10) : 0;
      const rawData = (sub.rawData ?? {}) as Record<string, unknown>;
      const productId = rawData.productId as string | undefined;
      // MSRP from the subscription's price field (what customer pays)
      let msrpCents = typeof rawData.price === 'number' ? Math.round(rawData.price * 100) : unitCostCents;
      let vendorName: string | undefined;

      if (productId) {
        try {
          const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);
          const product = await pax8Fetch<Pax8Product>(token, `/products/${productId}`);
          vendorName = product.vendorName;

          // Also try the pricing endpoint for more accurate MSRP
          try {
            const pricingData = await pax8Fetch<unknown>(token, `/products/${productId}/pricing?companyId=${sub.pax8CompanyId}`);
            const srp = extractMsrp(pricingData);
            if (srp != null) msrpCents = Math.round(srp * 100);
          } catch { /* pricing endpoint may not be available for all products */ }
        } catch { /* use what we have */ }
      }

      // Try to match a catalog item by pax8 product ID first, then by name
      let [catalogMatch] = productId
        ? await fastify.db
            .select()
            .from(serviceCatalogItems)
            .where(and(
              eq(serviceCatalogItems.tenantId, request.tenantId),
              eq(serviceCatalogItems.pax8ProductId, productId),
            ))
            .limit(1)
        : [];

      if (!catalogMatch) {
        [catalogMatch] = await fastify.db
          .select()
          .from(serviceCatalogItems)
          .where(and(
            eq(serviceCatalogItems.tenantId, request.tenantId),
            eq(serviceCatalogItems.pax8ProductName, sub.productName),
          ))
          .limit(1);
      }

      // Auto-create catalog item if it doesn't exist
      if (!catalogMatch) {
        console.log(`[PAX8-IMPORT] Creating catalog item: "${sub.productName}" cost=${unitCostCents} msrp=${msrpCents} vendor=${vendorName}`);
        [catalogMatch] = await fastify.db.insert(serviceCatalogItems).values({
          tenantId: request.tenantId,
          name: sub.productName,
          description: sub.productName,
          category: 'license',
          itemType: 'recurring',
          defaultUnitPriceCents: msrpCents,
          defaultUnitCostCents: unitCostCents,
          vendor: vendorName,
          pax8ProductId: productId,
          pax8ProductName: sub.productName,
          pax8VendorName: vendorName,
        }).returning();
        console.log(`[PAX8-IMPORT] Created catalog item: ${catalogMatch.id}`);
      } else {
        console.log(`[PAX8-IMPORT] Found existing catalog item: "${catalogMatch.name}" (${catalogMatch.id})`);
      }

      const category = catalogMatch.category;
      const unitPriceCents = catalogMatch.defaultUnitPriceCents ?? msrpCents;

      const [lineItem] = await fastify.db.insert(contractLineItems).values({
        tenantId: request.tenantId,
        contractId,
        description: sub.productName,
        itemType: 'recurring',
        category,
        unitPriceCents,
        unitCostCents,
        quantity: sub.quantity ?? '1',
        taxable: true,
        pax8SubscriptionId: sub.pax8SubscriptionId,
      }).returning();

      // Link the subscription record to the line item
      await fastify.db.update(pax8Subscriptions).set({
        contractLineItemId: lineItem.id,
        updatedAt: new Date(),
      }).where(eq(pax8Subscriptions.id, sub.id));

      imported.push(lineItem.id);
    }

    return { imported: imported.length, lineItemIds: imported };
  });

  // Full sync — refresh all subscriptions for all mapped customers
  fastify.post('/api/v1/pax8/sync', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const config = await getPax8Config(fastify.db, request.tenantId);
    if (!config?.isEnabled) throw new Error('Pax8 is not enabled');

    // Mark syncing
    await fastify.db.update(integrationConfigs).set({
      syncStatus: 'syncing', syncError: null, updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, config.id));

    try {
      const creds = (config.credentials ?? {}) as Record<string, string>;
      const token = await getPax8Token({ clientId: creds.clientId, clientSecret: creds.clientSecret });

      // Get all mapped customers
      const mappedCustomers = await fastify.db
        .select({ id: customers.id, pax8CompanyId: customers.pax8CompanyId })
        .from(customers)
        .where(and(eq(customers.tenantId, request.tenantId), isNotNull(customers.pax8CompanyId)));

      let totalSynced = 0;

      for (const cust of mappedCustomers) {
        if (!cust.pax8CompanyId) continue;
        const pax8Data = await pax8Fetch<Pax8PagedResponse<Pax8Subscription>>(
          token,
          `/subscriptions?companyId=${cust.pax8CompanyId}&size=200`,
        );

        // Resolve product names for this batch
        const pids = [...new Set(pax8Data.content.map((s) => s.productId).filter(Boolean))];
        const nameMap = new Map<string, string>();
        for (const pid of pids) {
          try {
            const prod = await pax8Fetch<Pax8Product>(token, `/products/${pid}`);
            nameMap.set(pid, prod.name);
          } catch { /* delisted product */ }
        }

        for (const sub of pax8Data.content) {
          const resolvedName = nameMap.get(sub.productId) || sub.productName || 'Unknown Product';

          const [existing] = await fastify.db
            .select()
            .from(pax8Subscriptions)
            .where(and(
              eq(pax8Subscriptions.tenantId, request.tenantId),
              eq(pax8Subscriptions.pax8SubscriptionId, sub.id),
            ))
            .limit(1);

          const values = {
            pax8CompanyId: sub.companyId,
            customerId: cust.id,
            productName: resolvedName,
            quantity: String(sub.quantity ?? 0),
            unitPriceCents: sub.price != null ? String(Math.round(sub.price * 100)) : null,
            billingTerm: sub.billingTerm ?? null,
            startDate: sub.startDate ?? null,
            status: sub.status ?? null,
            rawData: sub,
            syncedAt: new Date(),
            updatedAt: new Date(),
          };

          if (existing) {
            await fastify.db.update(pax8Subscriptions).set(values).where(eq(pax8Subscriptions.id, existing.id));

            // If linked to a contract line item, check for quantity increase and prorate
            if (existing.contractLineItemId) {
              const oldQty = parseFloat(existing.quantity ?? '0');
              const newQty = sub.quantity ?? 0;
              const qtyDelta = newQty - oldQty;

              // Quantity increased mid-cycle — create a proration line item
              if (qtyDelta > 0) {
                const [linkedLi] = await fastify.db
                  .select({ contractId: contractLineItems.contractId, unitPriceCents: contractLineItems.unitPriceCents, category: contractLineItems.category })
                  .from(contractLineItems)
                  .where(eq(contractLineItems.id, existing.contractLineItemId))
                  .limit(1);

                if (linkedLi) {
                  const costPerUnit = sub.price != null ? Math.round(sub.price * 100) : 0;
                  await createProrationLineItem(fastify.db, {
                    tenantId: request.tenantId,
                    contractId: linkedLi.contractId,
                    productName: resolvedName,
                    quantityDelta: qtyDelta,
                    unitPriceCents: linkedLi.unitPriceCents,
                    unitCostCents: costPerUnit,
                    category: linkedLi.category || 'license',
                    changeDate: new Date(),
                  });
                }
              }

              await fastify.db.update(contractLineItems).set({
                unitCostCents: sub.price != null ? Math.round(sub.price * 100) : undefined,
                quantity: String(newQty),
                updatedAt: new Date(),
              }).where(eq(contractLineItems.id, existing.contractLineItemId));
            }
          } else {
            await fastify.db.insert(pax8Subscriptions).values({
              tenantId: request.tenantId,
              pax8SubscriptionId: sub.id,
              ...values,
            });
          }
          totalSynced++;
        }
      }

      await fastify.db.update(integrationConfigs).set({
        syncStatus: 'idle', lastSyncAt: new Date(), syncError: null, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));

      return { success: true, synced: totalSynced, companies: mappedCustomers.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      await fastify.db.update(integrationConfigs).set({
        syncStatus: 'error', syncError: message, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));
      throw err;
    }
  });

  // ─── Subscription Management ──────────────────────────────────────

  // Update subscription quantity on Pax8
  fastify.patch('/api/v1/pax8/subscriptions/:subscriptionId/quantity', {
    preHandler: [fastify.authenticate, requirePermission('contracts:write')],
  }, async (request) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { quantity } = request.body as { quantity: number };

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error('Quantity must be a non-negative integer');
    }

    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);

    // Find local subscription record
    const [localSub] = await fastify.db
      .select()
      .from(pax8Subscriptions)
      .where(and(
        eq(pax8Subscriptions.tenantId, request.tenantId),
        eq(pax8Subscriptions.pax8SubscriptionId, subscriptionId),
      ))
      .limit(1);
    if (!localSub) throw new Error('Subscription not found');

    const oldQty = parseFloat(localSub.quantity ?? '0');

    // Update on Pax8 via PUT /v1/subscriptions/{id}
    const pax8Res = await fetch(`https://api.pax8.com/v1/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (!pax8Res.ok) {
      const body = await pax8Res.text();
      throw new Error(`Pax8 API error (${pax8Res.status}): ${body}`);
    }

    // Update local cache
    await fastify.db.update(pax8Subscriptions).set({
      quantity: String(quantity),
      syncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(pax8Subscriptions.id, localSub.id));

    // If linked to a contract line item, update qty + create proration for increases
    if (localSub.contractLineItemId) {
      const qtyDelta = quantity - oldQty;

      if (qtyDelta > 0) {
        const [linkedLi] = await fastify.db
          .select({ contractId: contractLineItems.contractId, unitPriceCents: contractLineItems.unitPriceCents, unitCostCents: contractLineItems.unitCostCents, category: contractLineItems.category })
          .from(contractLineItems)
          .where(eq(contractLineItems.id, localSub.contractLineItemId))
          .limit(1);

        if (linkedLi) {
          await createProrationLineItem(fastify.db, {
            tenantId: request.tenantId,
            contractId: linkedLi.contractId,
            productName: localSub.productName,
            quantityDelta: qtyDelta,
            unitPriceCents: linkedLi.unitPriceCents,
            unitCostCents: linkedLi.unitCostCents ?? 0,
            category: linkedLi.category || 'license',
            changeDate: new Date(),
          });
        }
      }

      await fastify.db.update(contractLineItems).set({
        quantity: String(quantity),
        updatedAt: new Date(),
      }).where(eq(contractLineItems.id, localSub.contractLineItemId));
    }

    return { success: true, oldQuantity: oldQty, newQuantity: quantity };
  });

  // Cancel a subscription on Pax8
  fastify.delete('/api/v1/pax8/subscriptions/:subscriptionId', {
    preHandler: [fastify.authenticate, requirePermission('contracts:write')],
  }, async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { token } = await getAuthenticatedPax8(fastify.db, request.tenantId);

    // Find local subscription record
    const [localSub] = await fastify.db
      .select()
      .from(pax8Subscriptions)
      .where(and(
        eq(pax8Subscriptions.tenantId, request.tenantId),
        eq(pax8Subscriptions.pax8SubscriptionId, subscriptionId),
      ))
      .limit(1);
    if (!localSub) throw new Error('Subscription not found');

    // Cancel on Pax8
    const pax8Res = await fetch(`https://api.pax8.com/v1/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pax8Res.ok) {
      const body = await pax8Res.text();
      throw new Error(`Pax8 API error (${pax8Res.status}): ${body}`);
    }

    // Update local status
    await fastify.db.update(pax8Subscriptions).set({
      status: 'Cancelled',
      updatedAt: new Date(),
    }).where(eq(pax8Subscriptions.id, localSub.id));

    // If linked to a contract line item, set quantity to 0
    if (localSub.contractLineItemId) {
      await fastify.db.update(contractLineItems).set({
        quantity: '0',
        updatedAt: new Date(),
      }).where(eq(contractLineItems.id, localSub.contractLineItemId));
    }

    return { success: true, message: 'Subscription cancelled' };
  });
}
