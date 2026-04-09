import { createDb } from '../client.js';
import { agentReleases } from '../schema/index.js';

async function seed() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://rivertown:rivertown@localhost:5432/rivertown';
  const db = createDb(databaseUrl);

  console.log('Inserting agent release...');

  const [release] = await db.insert(agentReleases).values({
    version: '0.2.0',
    platform: 'win-x64',
    sha256: 'a06d88040ac052a2b1d1f0c2eba6044b524edbecb31245f674d6a1e4925d7115',
    fileSize: 126949021,
    fileName: 'rivertown-agent-0.2.0-win-x64.zip',
    releaseNotes: 'Initial release with MQTT, enrollment, heartbeats, inventory, scripts, terminal, system tray, auto-update',
    isMandatory: false,
    isLatest: true,
  }).returning();

  console.log('Created release:', release.version, release.id);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
