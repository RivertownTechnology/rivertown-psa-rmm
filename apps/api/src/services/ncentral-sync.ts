import { eq, and } from 'drizzle-orm';
import { integrationConfigs, assets, customers } from '@rivertown/db';

interface NCentralDevice {
  deviceId: number;
  longName: string;
  uri: string;
  deviceClass: string;
  supportedOs: string;
  customerId: number;
  orgUnitId: number;
  description: string;
}

interface NCentralAssetDetail {
  serialnumber?: string;
  manufacturer?: string;
  model?: string;
  ipaddress?: string;
  macaddress?: string;
  os?: { name?: string; version?: string };
}

const SYNC_INTERVALS_MS: Record<string, number> = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

// ── N-central API helpers ───────────────────────────────────────────

async function getNCentralAccessToken(serverUrl: string, jwtToken: string): Promise<string> {
  const base = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/api/auth/authenticate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  if (!res.ok) throw new Error(`N-central auth failed (${res.status})`);
  const data = await res.json() as any;
  return data.tokens?.access?.token ?? '';
}

async function fetchNCentralDevices(serverUrl: string, accessToken: string): Promise<NCentralDevice[]> {
  const base = serverUrl.replace(/\/+$/, '');
  const allDevices: NCentralDevice[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${base}/api/devices?pageSize=200&pageNumber=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`N-central devices API error (${res.status})`);
    const data = await res.json() as any;
    if (!data.data || !Array.isArray(data.data)) break;
    allDevices.push(...data.data);
    if (allDevices.length >= (data.totalItems || 0)) break;
    page++;
  }
  return allDevices;
}

async function fetchNCentralDeviceAsset(serverUrl: string, accessToken: string, deviceId: number): Promise<NCentralAssetDetail | null> {
  const base = serverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/devices/${deviceId}/assets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json() as NCentralAssetDetail;
  } catch {
    return null;
  }
}

async function fetchNCentralCustomers(serverUrl: string, accessToken: string): Promise<Array<{ customerId: number; customerName: string }>> {
  const base = serverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/customers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

// Exported for the test endpoint
export async function fetchNCentralDevicesForTest(
  serverUrl: string, jwtToken: string,
): Promise<NCentralDevice[]> {
  const accessToken = await getNCentralAccessToken(serverUrl, jwtToken);
  return fetchNCentralDevices(serverUrl, accessToken);
}

// ── Sync runner ──────────────────────────────────────────────────────

export async function runNCentralSync(db: any, tenantId: string): Promise<{ synced: number; created: number }> {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'ncentral')))
    .limit(1);

  if (!config?.isEnabled) return { synced: 0, created: 0 };

  const creds = (config.credentials ?? {}) as Record<string, string>;
  const settings = (config.settings ?? {}) as Record<string, string>;

  const serverUrl = settings.serverUrl;
  const jwtToken = creds.jwtToken;
  if (!serverUrl || !jwtToken) return { synced: 0, created: 0 };

  // Mark syncing
  await db.update(integrationConfigs).set({
    syncStatus: 'syncing', syncError: null, updatedAt: new Date(),
  }).where(eq(integrationConfigs.id, config.id));

  try {
    const accessToken = await getNCentralAccessToken(serverUrl, jwtToken);
    const devices = await fetchNCentralDevices(serverUrl, accessToken);

    // Fetch N-central customer list to map customerId → name
    const ncCustomers = await fetchNCentralCustomers(serverUrl, accessToken);
    const ncCustomerMap = new Map<number, string>();
    for (const c of ncCustomers) {
      ncCustomerMap.set(c.customerId, c.customerName);
    }

    // Pre-fetch all customers for this tenant for name matching
    const allCustomers = await db
      .select({ id: customers.id, name: customers.name, ncentralName: customers.ncentralName })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));

    let totalSynced = 0;
    let totalCreated = 0;

    console.log(`[ncentral-sync] Found ${devices.length} devices, ${ncCustomers.length} N-central customers, ${allCustomers.length} PSA customers`);

    for (const device of devices) {
      const deviceIdStr = String(device.deviceId);
      const hostname = device.longName;

      // 1. Try to match by externalRmmId
      let [existingAsset] = await db
        .select()
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          eq(assets.externalRmmId, deviceIdStr),
        ))
        .limit(1);

      // 2. If no match, try by hostname within same customer
      if (!existingAsset && hostname) {
        const ncCustomerName = ncCustomerMap.get(device.customerId) || '';
        const matchedCustomer = allCustomers.find((c: any) =>
          (c.ncentralName && c.ncentralName.toLowerCase() === ncCustomerName.toLowerCase()) ||
          c.name.toLowerCase() === ncCustomerName.toLowerCase()
        );

        if (matchedCustomer) {
          [existingAsset] = await db
            .select()
            .from(assets)
            .where(and(
              eq(assets.tenantId, tenantId),
              eq(assets.customerId, matchedCustomer.id),
              eq(assets.name, hostname),
            ))
            .limit(1);
        }
      }

      // Fetch detailed asset info for this device
      const detail = await fetchNCentralDeviceAsset(serverUrl, accessToken, device.deviceId);

      const assetFields: Record<string, unknown> = {
        externalRmmId: deviceIdStr,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      };

      if (detail) {
        if (detail.ipaddress) assetFields.ipAddress = detail.ipaddress;
        if (detail.serialnumber) assetFields.serialNumber = detail.serialnumber;
        if (detail.manufacturer) assetFields.manufacturer = detail.manufacturer;
        if (detail.model) assetFields.model = detail.model;
        if (detail.os?.name) assetFields.osName = detail.os.name;
        if (detail.os?.version) assetFields.osVersion = detail.os.version;
      }

      // Fallback: use supportedOs from the device list if no detail OS
      if (!assetFields.osName && device.supportedOs) {
        assetFields.osName = device.supportedOs;
      }

      if (existingAsset) {
        // Update existing asset
        await db.update(assets).set(assetFields).where(eq(assets.id, existingAsset.id));
        totalSynced++;
      } else {
        // Find customer by N-central customer name
        const ncCustomerName = ncCustomerMap.get(device.customerId) || '';
        const matchedCustomer = allCustomers.find((c: any) =>
          (c.ncentralName && c.ncentralName.toLowerCase() === ncCustomerName.toLowerCase()) ||
          c.name.toLowerCase() === ncCustomerName.toLowerCase()
        );

        if (matchedCustomer) {
          // Create new asset
          await db.insert(assets).values({
            tenantId,
            customerId: matchedCustomer.id,
            assetType: 'workstation',
            name: hostname || deviceIdStr,
            ...assetFields,
          });
          totalCreated++;
          totalSynced++;
        }
        else {
          // No matching customer — log and skip
          console.log(`[ncentral-sync] Skipped device "${hostname}" — no matching customer for N-central customer "${ncCustomerName}"`);
        }
      }
    }

    // Update config with success
    await db.update(integrationConfigs).set({
      syncStatus: 'idle', lastSyncAt: new Date(), syncError: null, updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, config.id));

    return { synced: totalSynced, created: totalCreated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await db.update(integrationConfigs).set({
      syncStatus: 'error', syncError: message, updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, config.id));
    return { synced: 0, created: 0 };
  }
}

// ── Scheduled sync ───────────────────────────────────────────────────

/**
 * Start the N-central auto-sync polling loop.
 * Checks every 60s which tenants are due for a sync based on their configured frequency.
 */
export function startNCentralSyncScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Find all enabled N-central configs
      const configs = await db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.provider, 'ncentral'), eq(integrationConfigs.isEnabled, true)));

      for (const config of configs) {
        const settings = (config.settings ?? {}) as Record<string, string>;
        const frequency = settings.syncFrequency || 'daily';
        const intervalMs = SYNC_INTERVALS_MS[frequency] ?? SYNC_INTERVALS_MS.daily;

        // Check if enough time has passed since last sync
        const lastSync = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
        const now = Date.now();
        if (now - lastSync < intervalMs) continue;

        // Don't sync if already syncing
        if (config.syncStatus === 'syncing') continue;

        console.log(`[NC-SYNC] Auto-syncing tenant ${config.tenantId} (frequency: ${frequency})`);
        try {
          const result = await runNCentralSync(db, config.tenantId);
          console.log(`[NC-SYNC] Tenant ${config.tenantId}: synced ${result.synced} assets, ${result.created} created`);
        } catch (err) {
          console.error(`[NC-SYNC] Tenant ${config.tenantId} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[NC-SYNC] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000); // Check every 60 seconds
}
