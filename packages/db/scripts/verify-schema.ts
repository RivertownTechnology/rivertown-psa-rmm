import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });

async function check(label: string, query: () => Promise<unknown[]>, expectMin = 1) {
  try {
    const rows = await query();
    const ok = rows.length >= expectMin;
    console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` (found ${rows.length})`}`);
  } catch (err) {
    console.log(`✗ ${label} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('=== Schema verification ===\n');

await check('tenants.trial_ends_at', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'trial_ends_at'`,
);
await check('tenants.subscription_status', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_status'`,
);
await check('tenants.stripe_customer_id', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id'`,
);
await check('tenants.stripe_subscription_id', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'stripe_subscription_id'`,
);
await check('tenants.plan_tier', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'plan_tier'`,
);
await check('tenants.past_due_at', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'past_due_at'`,
);
await check('tenants.company_type', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'company_type'`,
);
await check('tenants.billing_model', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'billing_model'`,
);
await check('tenants.currency', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'currency'`,
);
await check('tenants.feature_flags', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'feature_flags'`,
);
await check('users.is_super_admin', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_super_admin'`,
);
await check('users.phone', () =>
  sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone'`,
);
await check('users.email lower-unique index', () =>
  sql`SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_email_lower_uniq'`,
);
await check('system_configs table', () =>
  sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'system_configs'`,
);
await check('tenant_sso_configs table', () =>
  sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_sso_configs'`,
);
await check('support_tickets table', () =>
  sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets'`,
);
await check('_migrations tracking table', () =>
  sql`SELECT 1 FROM information_schema.tables WHERE table_name = '_migrations'`,
);

console.log('\n=== Current tenant snapshot ===\n');
const tenants = await sql<any[]>`
  SELECT id, name, plan_tier, subscription_status, trial_ends_at, company_type, billing_model, currency, feature_flags
  FROM tenants ORDER BY created_at
`;
for (const t of tenants) {
  console.log(`${t.name}`);
  console.log(`  plan=${t.plan_tier} status=${t.subscription_status} type=${t.company_type} billing=${t.billing_model ?? '-'} currency=${t.currency}`);
  console.log(`  trial_ends_at=${t.trial_ends_at ?? '-'}`);
  console.log(`  feature_flags=${JSON.stringify(t.feature_flags)}`);
}

console.log('\n=== Super-admins ===\n');
const admins = await sql<any[]>`
  SELECT email, display_name FROM users WHERE is_super_admin = true ORDER BY created_at
`;
for (const a of admins) {
  console.log(`  ${a.email}  (${a.display_name})`);
}

console.log('\n=== Migrations applied ===\n');
const migs = await sql<any[]>`SELECT filename FROM _migrations ORDER BY filename`;
console.log(`  ${migs.length} total`);
console.log(`  Latest: ${migs[migs.length - 1]?.filename}`);

await sql.end();
