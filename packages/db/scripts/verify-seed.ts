import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const tid = 'd35afbb7-6ed0-4fb6-8f0b-b6b5ab915838';
const [row] = await sql<any[]>`
  SELECT
    (SELECT COUNT(*) FROM customers WHERE tenant_id = ${tid})::int as customers,
    (SELECT COUNT(*) FROM contacts  WHERE tenant_id = ${tid})::int as contacts,
    (SELECT COUNT(*) FROM tickets   WHERE tenant_id = ${tid})::int as tickets,
    (SELECT COUNT(*) FROM contracts WHERE tenant_id = ${tid})::int as contracts,
    (SELECT COUNT(*) FROM contract_line_items WHERE tenant_id = ${tid})::int as contract_lines,
    (SELECT COUNT(*) FROM invoices  WHERE tenant_id = ${tid})::int as invoices,
    (SELECT COUNT(*) FROM invoice_line_items WHERE tenant_id = ${tid})::int as invoice_lines,
    (SELECT name FROM tenants WHERE id = ${tid}) as tenant_name
`;
console.log(row);
await sql.end();
