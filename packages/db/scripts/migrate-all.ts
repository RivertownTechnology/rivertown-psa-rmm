/**
 * One-shot migration runner — applies every .sql file in src/migrations in order.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." pnpm --filter @rivertown/db exec tsx scripts/migrate-all.ts
 *
 * Safe to re-run: all migration files use IF NOT EXISTS / IF EXISTS clauses.
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

  const sql = postgres(url, { max: 1, ssl: 'prefer' });

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const contents = readFileSync(path, 'utf8');
    process.stdout.write(`Running ${file} ... `);
    try {
      await sql.unsafe(contents);
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
