import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { agentReleases } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const BUILDS_DIR = process.env.AGENT_BUILDS_DIR || './data/agent-builds';

export async function agentDistributionRoutes(fastify: FastifyInstance) {
  // Ensure builds directory exists
  fs.mkdirSync(BUILDS_DIR, { recursive: true });

  // Check for updates (public — agents call this without auth)
  fastify.get('/api/v1/rmm/agent/version', {
    config: { public: true } as any,
  }, async (request) => {
    const { current, platform } = request.query as { current?: string; platform?: string };
    const plat = platform || 'win-x64';

    const [latest] = await fastify.db.select().from(agentReleases)
      .where(and(eq(agentReleases.platform, plat), eq(agentReleases.isLatest, true)))
      .limit(1);

    if (!latest) {
      return {
        latestVersion: current || '0.0.0',
        currentVersion: current || '0.0.0',
        updateAvailable: false,
        downloadUrl: '',
        sha256: '',
        releaseNotes: '',
        mandatory: false,
      };
    }

    const updateAvailable = current ? compareVersions(latest.version, current) > 0 : false;

    return {
      latestVersion: latest.version,
      currentVersion: current || '0.0.0',
      updateAvailable,
      downloadUrl: `/api/v1/rmm/agent/download/${latest.version}/${plat}`,
      sha256: latest.sha256 || '',
      releaseNotes: latest.releaseNotes || '',
      mandatory: latest.isMandatory,
    };
  });

  // Download agent binary (public — agents and installers call this)
  fastify.get('/api/v1/rmm/agent/download/:version/:platform', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const { version, platform } = request.params as { version: string; platform: string };
    const ver = version === 'latest' ? undefined : version;

    let release;
    if (ver) {
      [release] = await fastify.db.select().from(agentReleases)
        .where(and(eq(agentReleases.version, ver), eq(agentReleases.platform, platform)))
        .limit(1);
    } else {
      [release] = await fastify.db.select().from(agentReleases)
        .where(and(eq(agentReleases.platform, platform), eq(agentReleases.isLatest, true)))
        .limit(1);
    }

    if (!release) {
      reply.code(404).send({ error: 'Release not found' });
      return;
    }

    // Try local file first, then redirect to blob storage
    const filePath = path.join(BUILDS_DIR, release.fileName);
    if (fs.existsSync(filePath)) {
      reply.header('Content-Disposition', `attachment; filename="${release.fileName}"`);
      reply.header('Content-Type', 'application/zip');
      const stream = fs.createReadStream(filePath);
      return reply.send(stream);
    }

    // Redirect to Azure Blob Storage
    const blobUrl = `https://rivertownpsa.blob.core.windows.net/downloads/${release.fileName}`;
    reply.header('Location', blobUrl);
    reply.code(302).send();
  });

  // Upload a new agent build (admin only)
  fastify.post('/api/v1/rmm/agent/upload', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400).send({ error: 'No file uploaded' });
      return;
    }

    const { version, platform, releaseNotes, isMandatory } = data.fields as any;
    const ver = version?.value || '0.0.0';
    const plat = platform?.value || 'win-x64';
    const notes = releaseNotes?.value || '';
    const mandatory = isMandatory?.value === 'true';

    const fileName = `rivertown-agent-${ver}-${plat}.zip`;
    const filePath = path.join(BUILDS_DIR, fileName);

    // Save file
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(filePath, buffer);

    // Calculate SHA-256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Mark all existing releases for this platform as not latest
    await fastify.db.update(agentReleases)
      .set({ isLatest: false })
      .where(and(eq(agentReleases.platform, plat), eq(agentReleases.isLatest, true)));

    // Insert new release
    const [release] = await fastify.db.insert(agentReleases).values({
      version: ver, platform: plat, sha256,
      fileSize: buffer.length, fileName,
      releaseNotes: notes, isMandatory: mandatory, isLatest: true,
    }).returning();

    reply.code(201);
    return release;
  });

  // List releases (admin)
  fastify.get('/api/v1/rmm/agent/releases', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async () => {
    return fastify.db.select().from(agentReleases).orderBy(desc(agentReleases.createdAt));
  });

  // Generate installer package for enrollment (public with key)
  fastify.get('/api/v1/rmm/agent/installer/:key', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const { key } = request.params as { key: string };

    // Decode enrollment key to get tenant/token info
    const { integrationConfigs } = await import('@rivertown/db');
    // The key is the enrollment token itself — just package it
    // Serve a zip with setup exe + install-config.json

    // For now, redirect to the PowerShell installer script approach
    // Later: serve actual bundled installer
    reply.header('Content-Type', 'application/json');
    return {
      instructions: 'Download the setup and run with the token',
      powershell: `Invoke-WebRequest -Uri '${request.headers.origin || 'https://psa.rivertowntechnology.com'}/api/v1/rmm/agent/download/latest/win-x64' -OutFile agent.zip; Expand-Archive agent.zip -DestinationPath 'C:\\Program Files\\Rivertown\\Agent' -Force; & 'C:\\Program Files\\Rivertown\\Agent\\RivertownAgentSetup.exe' --token ${key} --api ${request.headers.origin || 'https://psa.rivertowntechnology.com'}`,
      downloadUrl: `/api/v1/rmm/agent/download/latest/win-x64`,
      token: key,
    };
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
