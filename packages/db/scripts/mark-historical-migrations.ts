/**
 * One-off: mark every migration file BEFORE 0034 as already applied in
 * _migrations. Use when the DB has the historical schema (via drizzle-kit
 * or hand-run SQL) but _migrations was never populated — so migrate-all.ts
 * would otherwise try to re-run 0001 and fail with "relation already exists".
 *
 * Does NOT touch 0034+ — subsequent `tsx scripts/migrate-all.ts` will apply
 * those normally.
 */
import postgres from 'postgres';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'migrations');
const CUTOFF = '0034'; // files whose prefix is < '0034' are historical

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = postgres(url, { max: 1, ssl: 'prefer' });

  await sql`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz DEFAULT NOW() NOT NULL
    )
  `;

  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const historical = files.filter(f => f.substring(0, 4) < CUTOFF);
  console.log(`Marking ${historical.length} historical migrations as applied (cutoff < ${CUTOFF}):`);

  for (const file of historical) {
    const existing = await sql`SELECT 1 FROM "_migrations" WHERE filename = ${file}`;
    if (existing.length === 0) {
      await sql`INSERT INTO "_migrations" (filename) VALUES (${file})`;
      console.log(`  recorded ${file}`);
    } else {
      console.log(`  (already recorded) ${file}`);
    }
  }

  await sql.end();
  console.log('Done. Now run: pnpm --filter @rivertown/db exec tsx scripts/migrate-all.ts');
}
main().catch(err => { console.error(err); process.exit(1); });
