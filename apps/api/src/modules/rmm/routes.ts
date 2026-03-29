import { FastifyInstance } from 'fastify';
import { eq, and, desc, count, isNull } from 'drizzle-orm';
import { rmmPolicies, assets, customers, agentRegistrations, patchStatuses, deviceCveEntries, scriptExecutions, edrIntegrations, deviceEdrStatus, deviceSoftware } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

export async function rmmRoutes(fastify: FastifyInstance) {
  // ===== POLICIES =====

  fastify.get('/api/v1/rmm/policies', { preHandler: [fastify.authenticate, requirePermission('rmm:read')] }, async (request) => {
    return fastify.db.select().from(rmmPolicies)
      .where(and(eq(rmmPolicies.tenantId, request.tenantId), eq(rmmPolicies.isActive, true)))
      .orderBy(rmmPolicies.name);
  });

  fastify.post('/api/v1/rmm/policies', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request, reply) => {
    const body = request.body as any;
    const [policy] = await fastify.db.insert(rmmPolicies).values({ tenantId: request.tenantId, ...body }).returning();
    reply.code(201);
    return policy;
  });

  fastify.patch('/api/v1/rmm/policies/:id', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [updated] = await fastify.db.update(rmmPolicies).set({ ...body, updatedAt: new Date() })
      .where(and(eq(rmmPolicies.id, id), eq(rmmPolicies.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/rmm/policies/:id', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(rmmPolicies).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(rmmPolicies.id, id), eq(rmmPolicies.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  fastify.post('/api/v1/rmm/policies/seed-defaults', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const existing = await fastify.db.select().from(rmmPolicies).where(eq(rmmPolicies.tenantId, request.tenantId));
    if (existing.length > 0) return { created: 0 };

    await fastify.db.insert(rmmPolicies).values([
      {
        tenantId: request.tenantId, name: 'Standard', description: 'Standard patching with maintenance window', isDefault: true,
        autoApproveCritical: true, autoApproveSecurity: true, autoApproveOther: false,
        approvalDelayDays: 3, rebootAfterUpdate: true, rebootSchedule: 'maintenance_window',
        maintenanceWindowStart: '02:00', maintenanceWindowEnd: '06:00', maintenanceWindowDays: [1, 2, 3, 4, 5],
      },
      {
        tenantId: request.tenantId, name: 'Aggressive', description: 'Auto-approve all patches, reboot immediately',
        autoApproveCritical: true, autoApproveSecurity: true, autoApproveOther: true,
        approvalDelayDays: 0, rebootAfterUpdate: true, rebootSchedule: 'immediate',
      },
    ]);
    return { created: 2 };
  });

  // ===== DEVICE DETAIL =====

  fastify.get('/api/v1/rmm/devices/:id', { preHandler: [fastify.authenticate, requirePermission('rmm:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [asset] = await fastify.db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).limit(1);
    if (!asset) throw new NotFoundError('Device', id);

    // Get customer + site names
    const [customer] = await fastify.db.select({ id: customers.id, name: customers.name, rmmPolicyId: customers.rmmPolicyId })
      .from(customers).where(eq(customers.id, asset.customerId)).limit(1);

    // Get agent registration
    const [agent] = asset.agentId
      ? await fastify.db.select().from(agentRegistrations).where(eq(agentRegistrations.id, asset.agentId)).limit(1)
      : [null];

    // Get patch statuses
    const patches = agent
      ? await fastify.db.select().from(patchStatuses)
          .where(eq(patchStatuses.agentId, agent.id)).orderBy(desc(patchStatuses.scannedAt))
      : [];

    // Get CVEs
    const cves = await fastify.db.select().from(deviceCveEntries)
      .where(and(eq(deviceCveEntries.assetId, id), isNull(deviceCveEntries.resolvedAt)))
      .orderBy(desc(deviceCveEntries.cvssScore));

    // Get script history
    const scripts = await fastify.db.select().from(scriptExecutions)
      .where(eq(scriptExecutions.assetId, id))
      .orderBy(desc(scriptExecutions.createdAt)).limit(20);

    // Get installed software
    const software = await fastify.db.select().from(deviceSoftware)
      .where(eq(deviceSoftware.assetId, id))
      .orderBy(deviceSoftware.name)
      .limit(500);

    // Get EDR status
    const edrStatus = await fastify.db.select().from(deviceEdrStatus)
      .where(eq(deviceEdrStatus.assetId, id));

    // Resolve effective policy
    const devicePolicy = asset.rmmPolicyId;
    const customerPolicy = customer?.rmmPolicyId;
    let effectivePolicyId = devicePolicy ?? customerPolicy;
    if (!effectivePolicyId) {
      const [defaultPolicy] = await fastify.db.select({ id: rmmPolicies.id })
        .from(rmmPolicies).where(and(eq(rmmPolicies.tenantId, request.tenantId), eq(rmmPolicies.isDefault, true))).limit(1);
      effectivePolicyId = defaultPolicy?.id ?? null;
    }
    const [effectivePolicy] = effectivePolicyId
      ? await fastify.db.select().from(rmmPolicies).where(eq(rmmPolicies.id, effectivePolicyId)).limit(1)
      : [null];

    // CVE risk scoring
    let cveRiskScore = 0;
    for (const cve of cves) {
      const score = parseFloat(cve.cvssScore ?? '0');
      if (score >= 9) cveRiskScore += 10;
      else if (score >= 7) cveRiskScore += 5;
      else if (score >= 4) cveRiskScore += 2;
      else cveRiskScore += 1;
    }
    const cveRiskRating = cveRiskScore > 20 ? 'critical' : cveRiskScore > 10 ? 'high' : cveRiskScore > 5 ? 'medium' : 'low';

    return {
      ...asset,
      customerName: customer?.name,
      agent,
      patches,
      cves,
      cveRiskScore,
      cveRiskRating,
      software,
      scripts,
      edrStatus,
      effectivePolicy,
      policySource: devicePolicy ? 'device' : customerPolicy ? 'customer' : effectivePolicyId ? 'default' : 'none',
    };
  });

  // Reassign device to different customer/site
  fastify.patch('/api/v1/rmm/devices/:id/reassign', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { id } = request.params as { id: string };
    const { customerId, siteId } = request.body as { customerId?: string; siteId?: string };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (customerId) update.customerId = customerId;
    if (siteId !== undefined) update.siteId = siteId;
    const [updated] = await fastify.db.update(assets).set(update)
      .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Set device policy override
  fastify.patch('/api/v1/rmm/devices/:id/policy', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { id } = request.params as { id: string };
    const { rmmPolicyId } = request.body as { rmmPolicyId: string | null };
    const [updated] = await fastify.db.update(assets).set({ rmmPolicyId, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ===== ON-DEMAND SCAN =====

  fastify.post('/api/v1/rmm/devices/:id/scan', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { id } = request.params as { id: string };
    const { scanType } = request.body as { scanType: 'inventory' | 'software' | 'windows_update' | 'disk' };

    const [asset] = await fastify.db.select({ agentId: assets.agentId }).from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).limit(1);
    if (!asset?.agentId) return { sent: false, reason: 'No agent connected' };

    const { sendAgentCommand } = await import('../../services/mqtt-client.js');
    const commandId = `scan-${Date.now()}`;
    const sent = sendAgentCommand(request.tenantId, asset.agentId, {
      commandId, type: `scan_${scanType}`, payload: {},
    });
    return { sent, commandId };
  });

  // ===== SCRIPT EXECUTION =====

  fastify.post('/api/v1/rmm/devices/:id/run-script', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { scriptContent, scriptName } = request.body as { scriptContent: string; scriptName?: string };

    const [exec] = await fastify.db.insert(scriptExecutions).values({
      tenantId: request.tenantId, assetId: id, scriptContent, scriptName,
      status: 'pending',
    }).returning();

    // Send command to agent via MQTT
    const { sendAgentCommand } = await import('../../services/mqtt-client.js');
    const [assetRecord] = await fastify.db.select({ agentId: assets.agentId }).from(assets)
      .where(eq(assets.id, id)).limit(1);
    if (assetRecord?.agentId) {
      const sent = sendAgentCommand(request.tenantId, assetRecord.agentId, {
        commandId: exec.id,
        type: 'script_exec',
        payload: { script: scriptContent },
      });
      if (sent) {
        await fastify.db.update(scriptExecutions).set({ status: 'running', startedAt: new Date() })
          .where(eq(scriptExecutions.id, exec.id));
      }
    }

    reply.code(201);
    return exec;
  });

  fastify.get('/api/v1/rmm/devices/:id/scripts', { preHandler: [fastify.authenticate, requirePermission('rmm:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(scriptExecutions)
      .where(and(eq(scriptExecutions.assetId, id), eq(scriptExecutions.tenantId, request.tenantId)))
      .orderBy(desc(scriptExecutions.createdAt)).limit(50);
  });

  // ===== EDR INTEGRATIONS =====

  fastify.get('/api/v1/rmm/edr-integrations', { preHandler: [fastify.authenticate, requirePermission('rmm:read')] }, async (request) => {
    return fastify.db.select().from(edrIntegrations).where(eq(edrIntegrations.tenantId, request.tenantId));
  });

  fastify.post('/api/v1/rmm/edr-integrations', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request, reply) => {
    const body = request.body as { provider: string; apiUrl?: string; apiKeyEncrypted?: string; settings?: any };
    const [integration] = await fastify.db.insert(edrIntegrations).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return integration;
  });

  fastify.patch('/api/v1/rmm/edr-integrations/:id', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [updated] = await fastify.db.update(edrIntegrations).set({ ...body, updatedAt: new Date() })
      .where(and(eq(edrIntegrations.id, id), eq(edrIntegrations.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ===== AGENT ENROLLMENT =====

  fastify.post('/api/v1/rmm/enroll', { config: { public: true } as any }, async (request, reply) => {
    const { enrollmentToken, machineId, hostname, osInfo } = request.body as {
      enrollmentToken: string; machineId: string; hostname: string; osInfo?: any;
    };

    // Validate enrollment token (JWT with tenantId + customerId)
    let payload: { tid: string; cid: string; sid?: string };
    try {
      payload = fastify.jwt.verify(enrollmentToken);
    } catch {
      reply.code(401).send({ error: 'Invalid enrollment token' }); return;
    }

    // Check for existing registration
    const [existing] = await fastify.db.select().from(agentRegistrations)
      .where(and(eq(agentRegistrations.tenantId, payload.tid), eq(agentRegistrations.machineId, machineId))).limit(1);

    if (existing) {
      // Re-enrollment — update
      await fastify.db.update(agentRegistrations).set({
        hostname, osInfo, agentVersion: '0.1.0', lastHeartbeat: new Date(), status: 'online', updatedAt: new Date(),
      }).where(eq(agentRegistrations.id, existing.id));
      return { agentId: existing.id, tenantId: payload.tid, customerId: payload.cid };
    }

    // New enrollment
    const [agent] = await fastify.db.insert(agentRegistrations).values({
      tenantId: payload.tid, customerId: payload.cid, siteId: payload.sid ?? null,
      machineId, hostname, agentVersion: '0.1.0', osInfo, status: 'online',
      lastHeartbeat: new Date(), enrolledAt: new Date(),
    }).returning();

    // Create/link asset
    const [asset] = await fastify.db.insert(assets).values({
      tenantId: payload.tid, customerId: payload.cid, siteId: payload.sid ?? null,
      assetType: 'workstation', name: hostname, agentId: agent.id,
      osName: osInfo?.osName, osVersion: osInfo?.osVersion,
      lastSeenAt: new Date(),
    }).returning();

    reply.code(201);
    return { agentId: agent.id, assetId: asset.id, tenantId: payload.tid, customerId: payload.cid };
  });

  // Generate enrollment token
  fastify.post('/api/v1/rmm/enrollment-token', { preHandler: [fastify.authenticate, requirePermission('rmm:command')] }, async (request) => {
    const { customerId, siteId } = request.body as { customerId: string; siteId?: string };
    const token = fastify.jwt.sign(
      { sub: 'enrollment', tid: request.tenantId, cid: customerId, sid: siteId, role: 'agent', type: 'access' } as any,
      { expiresIn: '24h' },
    );

    // Generate a unique key for MSI filename — short, URL-safe, encodes customer+site
    const keyParts = [
      request.tenantId.slice(0, 8),
      customerId.slice(0, 8),
      siteId ? siteId.slice(0, 8) : '00000000',
      Date.now().toString(36),
    ];
    const key = keyParts.join('').replace(/-/g, '');

    return { token, key, expiresIn: '24 hours' };
  });

  // ===== REMOTE DESKTOP (ScreenConnect integration — v0.2.0) =====

  // Placeholder for ScreenConnect integration
  fastify.get('/api/v1/rmm/devices/:id/remote', {
    preHandler: [fastify.authenticate, requirePermission('rmm:command')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [asset] = await fastify.db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).limit(1);
    if (!asset) throw new NotFoundError('Device', id);

    // TODO: ScreenConnect API integration
    // For now, return not configured status
    const screenconnectUrl = process.env.SCREENCONNECT_URL;
    if (!screenconnectUrl) {
      return { available: false, provider: 'screenconnect', reason: 'ScreenConnect not configured. Set up in Settings > Integrations.' };
    }

    return {
      available: true,
      provider: 'screenconnect',
      sessionUrl: `${screenconnectUrl}/Host#Access/All%20Machines/${asset.name}`,
      baseUrl: screenconnectUrl,
    };
  });

  // ===== LIVE TERMINAL WEBSOCKET =====

  fastify.get('/api/v1/rmm/agents/:agentId/terminal', {
    config: { public: true } as any,
    websocket: true
  }, async (socket, req) => {
    const { agentId } = req.params as { agentId: string };
    const token = (req.query as Record<string, string>).token;

    // Auth via token query param
    let tenantId = '';
    try {
      const payload = fastify.jwt.verify<{ tid: string }>(token);
      tenantId = payload.tid;
    } catch {
      socket.send(JSON.stringify({ type: 'error', data: 'Unauthorized' }));
      socket.close();
      return;
    }

    const sessionId = 'term-' + Date.now();
    console.log(`[Terminal] Session ${sessionId} opened for agent ${agentId}`);

    // Send terminal_start command to agent
    const { sendAgentCommand } = await import('../../services/mqtt-client.js');
    sendAgentCommand(tenantId, agentId, {
      commandId: sessionId,
      type: 'terminal_start',
      payload: { sessionId },
    });

    // Subscribe to agent's response topic for this session
    const mqttLib = await import('mqtt');
    const responseTopic = `rivertown/${tenantId}/${agentId}/terminal/${sessionId}`;

    // Each terminal session gets its own MQTT client to avoid cross-contamination
    const mqttClient = mqttLib.default.connect(process.env.MQTT_URL || 'mqtt://localhost:1883');

    mqttClient.on('connect', () => {
      mqttClient.subscribe(responseTopic);
    });

    mqttClient.on('message', (topic: string, message: Buffer) => {
      if (topic === responseTopic && socket.readyState === 1) {
        socket.send(message.toString());
      }
    });

    // Forward browser input to agent via MQTT
    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'input') {
          sendAgentCommand(tenantId, agentId, {
            commandId: sessionId,
            type: 'terminal_input',
            payload: { sessionId, input: msg.data },
          });
        }
      } catch {}
    });

    socket.on('close', () => {
      console.log(`[Terminal] Session ${sessionId} closed`);
      sendAgentCommand(tenantId, agentId, {
        commandId: sessionId,
        type: 'terminal_stop',
        payload: { sessionId },
      });
      mqttClient.end();
    });
  });
}