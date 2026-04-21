import { eq, and } from 'drizzle-orm';
import { integrationConfigs, assets, customers } from '@rivertown/db';
import { TOTP } from 'otpauth';

interface ScreenConnectSession {
  SessionID: string;
  Name: string;
  GuestOperatingSystemName: string;
  GuestMachineSerialNumber: string;
  GuestMachineManufacturerName: string;
  GuestMachineModel: string;
  GuestNetworkAddress: string;
  GuestLoggedOnUserName: string;
  GuestLastActivityTime: string;
  ConnectionCount: number;
  CustomProperty1: string;
  CustomProperty2: string;
  CustomProperty3: string;
  CustomProperty4: string;
  CustomProperty5: string;
  CustomProperty6: string;
  CustomProperty7: string;
  CustomProperty8: string;
  [key: string]: unknown;
}

const SYNC_INTERVALS_MS: Record<string, number> = {
  '5min': 5 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

// ── ScreenConnect API helper ─────────────────────────────────────────

function generateTOTP(secret: string): string {
  const totp = new TOTP({ secret, digits: 6, period: 30 });
  return totp.generate();
}

async function getScreenConnectAuthCookie(
  serverUrl: string,
  username: string,
  password: string,
  totpSecret: string,
): Promise<string> {
  const base = serverUrl.replace(/\/+$/, '');

  // Step 1: Login with username + password + TOTP
  const otp = generateTOTP(totpSecret);
  const loginRes = await fetch(`${base}/Services/AuthenticationService.ashx/TryLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([username, password, otp]),
    redirect: 'manual',
  });

  // Extract session cookies from response
  const cookies = loginRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.find(c => c.startsWith('.DVLAUTHSC=') || c.startsWith('.DVLAUTH=') || c.startsWith('ASP.NET_SessionId='));

  if (!sessionCookie && loginRes.status !== 200) {
    // Try alternative login endpoint format
    const altRes = await fetch(`${base}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ UserName: username, Password: password, OTP: otp }),
      redirect: 'manual',
    });
    const altCookies = altRes.headers.getSetCookie?.() ?? [];
    const altSession = altCookies.join('; ');
    if (altSession) return altSession;
    throw new Error(`ScreenConnect login failed (${altRes.status})`);
  }

  // Collect all relevant cookies
  return cookies.map(c => c.split(';')[0]).join('; ');
}

async function fetchScreenConnectSessions(
  serverUrl: string,
  username: string,
  password: string,
  totpSecret: string,
): Promise<ScreenConnectSession[]> {
  const base = serverUrl.replace(/\/+$/, '');
  const cookie = await getScreenConnectAuthCookie(base, username, password, totpSecret);

  const url = `${base}/Services/PageService.ashx/GetHostSessionInfo`;
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`ScreenConnect API error (${res.status})`);
  return res.json() as Promise<ScreenConnectSession[]>;
}

// ── Sync runner ──────────────────────────────────────────────────────

export async function runScreenConnectSync(db: any, tenantId: string): Promise<{ synced: number; created: number }> {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'screenconnect')))
    .limit(1);

  if (!config?.isEnabled) return { synced: 0, created: 0 };

  const creds = (config.credentials ?? {}) as Record<string, string>;
  const settings = (config.settings ?? {}) as Record<string, string>;

  const serverUrl = settings.serverUrl;
  const username = creds.username;
  const password = creds.password;
  const totpSecret = creds.totpSecret;
  if (!serverUrl || !username || !password || !totpSecret) return { synced: 0, created: 0 };

  const companyProperty = settings.companyProperty || 'CustomProperty1';

  // Mark syncing
  await db.update(integrationConfigs).set({
    syncStatus: 'syncing', syncError: null, updatedAt: new Date(),
  }).where(eq(integrationConfigs.id, config.id));

  try {
    const sessions = await fetchScreenConnectSessions(serverUrl, username, password, totpSecret);

    // Pre-fetch all customers for this tenant for name matching
    const allCustomers = await db
      .select({ id: customers.id, name: customers.name, screenconnectCompany: customers.screenconnectCompany })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));

    // Track which session IDs we see for the offline-marking step
    const seenSessionIds = new Set<string>();

    let totalSynced = 0;
    let totalCreated = 0;

    for (const session of sessions) {
      const sessionId = session.SessionID;
      const hostname = session.Name;
      const companyName = (session[companyProperty] as string) || '';
      const isOnline = session.ConnectionCount > 0;
      const serialNumber = session.GuestMachineSerialNumber || null;
      const osFullName = session.GuestOperatingSystemName || '';

      // Parse OS name/version from the full string (e.g. "Microsoft Windows 11 Pro 10.0.22631")
      const osParts = osFullName.match(/^(.+?)\s+([\d.]+)$/);
      const osName = osParts ? osParts[1] : osFullName;
      const osVersion = osParts ? osParts[2] : null;

      seenSessionIds.add(sessionId);

      // 1. Try to match by screenconnectSessionId
      let [existingAsset] = await db
        .select()
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          eq(assets.screenconnectSessionId, sessionId),
        ))
        .limit(1);

      // 2. If no match, try by hostname + serialNumber within same customer
      if (!existingAsset && hostname) {
        // Find the customer for this session
        const matchedCustomer = allCustomers.find((c: any) =>
          (c.screenconnectCompany && c.screenconnectCompany.toLowerCase() === companyName.toLowerCase()) ||
          c.name.toLowerCase() === companyName.toLowerCase()
        );

        if (matchedCustomer && serialNumber) {
          [existingAsset] = await db
            .select()
            .from(assets)
            .where(and(
              eq(assets.tenantId, tenantId),
              eq(assets.customerId, matchedCustomer.id),
              eq(assets.name, hostname),
              eq(assets.serialNumber, serialNumber),
            ))
            .limit(1);
        } else if (matchedCustomer) {
          // Try by hostname only within customer
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

      const assetFields = {
        screenconnectSessionId: sessionId,
        screenconnectOnline: isOnline,
        lastSeenAt: new Date(),
        ipAddress: session.GuestNetworkAddress || null,
        osName: osName || null,
        osVersion: osVersion,
        manufacturer: session.GuestMachineManufacturerName || null,
        model: session.GuestMachineModel || null,
        serialNumber: serialNumber,
        updatedAt: new Date(),
      };

      if (existingAsset) {
        // Update existing asset
        await db.update(assets).set(assetFields).where(eq(assets.id, existingAsset.id));
        totalSynced++;
      } else {
        // Find customer by company name
        const matchedCustomer = allCustomers.find((c: any) =>
          (c.screenconnectCompany && c.screenconnectCompany.toLowerCase() === companyName.toLowerCase()) ||
          c.name.toLowerCase() === companyName.toLowerCase()
        );

        if (matchedCustomer) {
          // Create new asset
          await db.insert(assets).values({
            tenantId,
            customerId: matchedCustomer.id,
            assetType: 'workstation',
            name: hostname || sessionId,
            ...assetFields,
          });
          totalCreated++;
          totalSynced++;
        }
        // If no matching customer, skip this session
      }
    }

    // Mark all assets NOT seen in this sync as offline
    const allScAssets = await db
      .select({ id: assets.id, screenconnectSessionId: assets.screenconnectSessionId })
      .from(assets)
      .where(and(
        eq(assets.tenantId, tenantId),
        eq(assets.screenconnectOnline, true),
      ));

    for (const asset of allScAssets) {
      if (asset.screenconnectSessionId && !seenSessionIds.has(asset.screenconnectSessionId)) {
        await db.update(assets).set({
          screenconnectOnline: false,
          updatedAt: new Date(),
        }).where(eq(assets.id, asset.id));
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
 * Start the ScreenConnect auto-sync polling loop.
 * Checks every 60s which tenants are due for a sync based on their configured frequency.
 */
export function startScreenConnectSyncScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Find all enabled ScreenConnect configs
      const configs = await db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.provider, 'screenconnect'), eq(integrationConfigs.isEnabled, true)));

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

        console.log(`[SC-SYNC] Auto-syncing tenant ${config.tenantId} (frequency: ${frequency})`);
        try {
          const result = await runScreenConnectSync(db, config.tenantId);
          console.log(`[SC-SYNC] Tenant ${config.tenantId}: synced ${result.synced} assets, ${result.created} created`);
        } catch (err) {
          console.error(`[SC-SYNC] Tenant ${config.tenantId} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[SC-SYNC] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000); // Check every 60 seconds
}
