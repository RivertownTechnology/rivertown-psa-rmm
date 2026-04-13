import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });

const cons = await sql<{ conname: string; def: string }[]>`
  SELECT conname, pg_get_constraintdef(oid) as def
  FROM pg_constraint
  WHERE conrelid = 'audit_log'::regclass
`;
console.log('audit_log constraints:');
for (const c of cons) console.log('  ' + c.conname + ' | ' + c.def);

// Try inserting a test row exactly like logAudit would
const testActorId = '15b5c3ed-1dd2-46a9-a736-80d1aad16c41'; // your super-admin user id
const testTargetId = 'f38b108d-8cdf-4daa-ac87-605baafc4bca';
const testTenantId = 'd35afbb7-6ed0-4fb6-8f0b-b6b5ab915838';

try {
  const [result] = await sql`
    INSERT INTO audit_log (tenant_id, actor_type, actor_id, action, entity_type, entity_id, changes)
    VALUES (${testTenantId}, 'super_admin', ${testActorId}, 'tenant.impersonate.test', 'user', ${testTargetId}, ${JSON.stringify({ target: { old: null, new: 'blaketurner06@gmail.com' } })}::jsonb)
    RETURNING id
  `;
  console.log('Test insert succeeded, id=' + result.id);
  await sql`DELETE FROM audit_log WHERE id = ${result.id}`;
  console.log('Test row cleaned up.');
} catch (err) {
  console.log('Test insert FAILED:', err);
}

await sql.end();
