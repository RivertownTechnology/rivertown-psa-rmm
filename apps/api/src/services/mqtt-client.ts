import mqtt from 'mqtt';
import { eq, and, lt } from 'drizzle-orm';
import { agentRegistrations, scriptExecutions } from '@rivertown/db';
import type { Database } from '@rivertown/db';

let mqttClient: mqtt.MqttClient | null = null;
let db: Database | null = null;

export function startMqttClient(database: Database, brokerUrl: string = 'mqtt://localhost:1883') {
  db = database;

  mqttClient = mqtt.connect(brokerUrl, {
    clientId: `rivertown-api-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker');
    // Subscribe to all agent heartbeats and responses
    mqttClient!.subscribe('rivertown/+/+/heartbeat');
    mqttClient!.subscribe('rivertown/+/+/response');
    mqttClient!.subscribe('rivertown/+/+/inventory');
    console.log('[MQTT] Subscribed to heartbeat, response, and inventory topics');
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const parts = topic.split('/');
      // rivertown/{tenantId}/{agentId}/{type}
      if (parts.length !== 4) return;

      const [, tenantId, agentId, msgType] = parts;
      const payload = JSON.parse(message.toString());

      if (msgType === 'heartbeat') {
        await handleHeartbeat(tenantId, agentId, payload);
      } else if (msgType === 'response') {
        await handleResponse(tenantId, agentId, payload);
      } else if (msgType === 'inventory') {
        await handleInventory(tenantId, agentId, payload);
      }
    } catch (err) {
      console.error('[MQTT] Error processing message:', err);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  mqttClient.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  // Offline detection: check every 60 seconds for agents that haven't sent heartbeat in 120s
  setInterval(async () => {
    if (!db) return;
    try {
      const threshold = new Date(Date.now() - 120000); // 2 minutes ago
      await db.update(agentRegistrations)
        .set({ status: 'offline' })
        .where(and(
          eq(agentRegistrations.status, 'online'),
          lt(agentRegistrations.lastHeartbeat, threshold),
        ));
    } catch { /* ignore errors in background task */ }
  }, 60000);
}

async function handleHeartbeat(tenantId: string, agentId: string, payload: any) {
  if (!db) return;

  // Update agent registration
  await db.update(agentRegistrations)
    .set({
      status: 'online',
      lastHeartbeat: new Date(),
      hostname: payload.hostname ?? undefined,
      agentVersion: payload.agentVersion ?? undefined,
      osInfo: payload,
      updatedAt: new Date(),
    })
    .where(and(
      eq(agentRegistrations.tenantId, tenantId),
      eq(agentRegistrations.id, agentId),
    ));

  // Also update the linked asset with heartbeat data
  const { assets } = await import('@rivertown/db');
  const assetUpdate: Record<string, unknown> = { lastSeenAt: new Date() };
  if (payload.osVersion) assetUpdate.osVersion = payload.osVersion;
  if (payload.ipAddress) assetUpdate.ipAddress = payload.ipAddress;
  if (payload.hostname) assetUpdate.name = payload.hostname;
  await db.update(assets).set(assetUpdate).where(eq(assets.agentId, agentId));
}

async function handleResponse(tenantId: string, agentId: string, payload: any) {
  if (!db) return;

  const commandId = payload.commandId;
  if (!commandId) return;

  console.log(`[MQTT] Response from agent ${agentId}: command=${commandId}, status=${payload.status}`);

  // Update script execution if this is a script response
  try {
    await db.update(scriptExecutions)
      .set({
        status: payload.status === 'success' ? 'completed' : payload.status === 'error' ? 'failed' : payload.status,
        output: payload.payload?.output ?? null,
        exitCode: payload.payload?.exitCode ?? null,
        completedAt: payload.completedAt ? new Date(payload.completedAt) : new Date(),
      })
      .where(eq(scriptExecutions.id, commandId));
  } catch { /* command might not be a script execution */ }
}

async function handleInventory(tenantId: string, agentId: string, payload: any) {
  if (!db) return;
  const { assets, deviceSoftware } = await import('@rivertown/db');

  // Find the asset linked to this agent
  const [asset] = await db.select({ id: assets.id }).from(assets)
    .where(eq(assets.agentId, agentId)).limit(1);
  if (!asset) return;

  // Merge inventory with existing data (don't overwrite full inventory with partial scans)
  const { assets: assetsTable } = await import('@rivertown/db');
  const [currentAsset] = await db.select({ systemInventory: assetsTable.systemInventory }).from(assetsTable)
    .where(eq(assetsTable.id, asset.id)).limit(1);
  const existingInventory = (currentAsset?.systemInventory as Record<string, unknown>) ?? {};

  const update: Record<string, unknown> = {
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };

  if (payload.system) {
    // Merge: new data overwrites matching keys, preserves rest
    update.systemInventory = { ...existingInventory, ...payload.system };
    update.lastInventoryAt = new Date();

    // Extract key fields to top-level columns
    if (payload.system?.os?.name) update.osName = payload.system.os.name;
    if (payload.system?.os?.version) update.osVersion = payload.system.os.version;
    if (payload.system?.bios?.serialNumber) update.serialNumber = payload.system.bios.serialNumber;
    if (payload.system?.bios?.manufacturer) update.manufacturer = payload.system.bios.manufacturer;
    if (payload.system?.networkAdapters?.[0]?.ipAddress) update.ipAddress = payload.system.networkAdapters[0].ipAddress;
    if (payload.system?.networkAdapters?.[0]?.macAddress) update.macAddress = payload.system.networkAdapters[0].macAddress;
  }

  await db.update(assets).set(update).where(eq(assets.id, asset.id));

  // Update installed software
  if (payload.software && Array.isArray(payload.software)) {
    // Clear old software list and replace
    await db.delete(deviceSoftware).where(eq(deviceSoftware.assetId, asset.id));
    for (const sw of payload.software) {
      await db.insert(deviceSoftware).values({
        tenantId, assetId: asset.id,
        name: sw.name, version: sw.version, publisher: sw.publisher, installDate: sw.installDate,
      });
    }
  }

  console.log(`[MQTT] Inventory updated for agent ${agentId}: ${payload.software?.length ?? 0} software items`);
}

// Send a command to a specific agent
export function sendAgentCommand(tenantId: string, agentId: string, command: {
  commandId: string; type: string; payload: Record<string, unknown>;
}) {
  if (!mqttClient?.connected) {
    console.error('[MQTT] Not connected, cannot send command');
    return false;
  }

  const topic = `rivertown/${tenantId}/${agentId}/command`;
  const message = JSON.stringify({
    ...command,
    issuedAt: new Date().toISOString(),
  });

  mqttClient.publish(topic, message, { qos: 1 });
  console.log(`[MQTT] Command sent to ${topic}: ${command.type}`);
  return true;
}

export function getMqttStatus() {
  return {
    connected: mqttClient?.connected ?? false,
  };
}
