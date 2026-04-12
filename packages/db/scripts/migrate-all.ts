/**
 * Migration runner — applies every .sql file in src/migrations in order, skipping
 * any that have already been applied (tracked in the _migrations table).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." pnpm --filter @rivertown/db exec tsx scripts/migrate-all.ts
 *
 * Flags:
 *   --force-record   Mark all existing .sql files as applied without running them.
 *                    Use this ONCE on databases that already have the schema applied
 *                    but don't have a _migrations tracking table yet.
 */
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const forceRecord = process.argv.includes('--force-record');
  const sql = postgres(url, { max: 1, ssl: 'prefer' });

  // Bootstrap tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz DEFAULT NOW() NOT NULL
    )
  `;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = await sql<{ filename: string }[]>`SELECT filename FROM "_migrations"`;
  const appliedSet = new Set(applied.map((r) => r.filename));

  if (forceRecord) {
    console.log('--force-record: marking all unrecorded migrations as applied without running them');
    for (const file of files) {
      if (!appliedSet.has(file)) {
        await sql`INSERT INTO "_migrations" (filename) VALUES (${file})`;
        console.log(`  recorded ${file}`);
      }
    }
    await sql.end();
    return;
  }

  const pending = files.filter((f) => !appliedSet.has(f));
  if (pending.length === 0) {
    console.log('No pending migrations — database is up to date.');
    await sql.end();
    return;
  }

  console.log(`Found ${pending.length} pending migration${pending.length === 1 ? '' : 's'} (${applied.length} already applied)\n`);

  for (const file of pending) {
    const path = join(MIGRATIONS_DIR, file);
    const contents = readFileSync(path, 'utf8');
    process.stdout.write(`Running ${file} ... `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO "_migrations" (filename) VALUES (${file})`;
      });
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(err);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log('\nAll migrations applied successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
