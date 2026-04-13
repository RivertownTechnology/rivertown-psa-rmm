import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const tid = 'd35afbb7-6ed0-4fb6-8f0b-b6b5ab915838';

console.log('=== Dunder Mifflin tenant state ===\n');

const [counts] = await sql<any[]>`
  SELECT
    (SELECT COUNT(*) FROM customers WHERE tenant_id = ${tid})::int customers,
    (SELECT COUNT(*) FROM contacts  WHERE tenant_id = ${tid})::int contacts,
    (SELECT COUNT(*) FROM tickets   WHERE tenant_id = ${tid})::int tickets,
    (SELECT COUNT(*) FROM contracts WHERE tenant_id = ${tid})::int contracts,
    (SELECT COUNT(*) FROM invoices  WHERE tenant_id = ${tid})::int invoices,
    (SELECT COUNT(*) FROM invoices  WHERE tenant_id = ${tid} AND status = 'open')::int open_invoices,
    (SELECT COUNT(*) FROM invoices  WHERE tenant_id = ${tid} AND status = 'open' AND due_date < CURRENT_DATE)::int past_due_invoices,
    (SELECT COUNT(*) FROM sla_policies WHERE tenant_id = ${tid})::int sla_policies,
    (SELECT COUNT(*) FROM ticket_time_entries WHERE tenant_id = ${tid})::int time_entries
`;
console.log('Counts:', counts);

console.log('\nSLA policies (name, response/resolution minutes for Critical / High / Medium / Low):');
const slas = await sql<any[]>`
  SELECT name, is_default,
    critical_response_minutes, critical_resolution_minutes,
    high_response_minutes, high_resolution_minutes,
    medium_response_minutes, medium_resolution_minutes,
    low_response_minutes, low_resolution_minutes
  FROM sla_policies WHERE tenant_id = ${tid} AND is_active = true ORDER BY name
`;
for (const s of slas) {
  console.log(`  ${s.name}${s.is_default ? ' (default)' : ''}`);
  console.log(`    Crit ${s.critical_response_minutes}m/${s.critical_resolution_minutes}m · High ${s.high_response_minutes}m/${s.high_resolution_minutes}m · Med ${s.medium_response_minutes}m/${s.medium_resolution_minutes}m · Low ${s.low_response_minutes}m/${s.low_resolution_minutes}m`);
}

console.log('\nCustomer → SLA tier:');
const custs = await sql<any[]>`
  SELECT c.name, s.name as sla, c.custom_fields->>'account_tier' as tier
  FROM customers c LEFT JOIN sla_policies s ON s.id = c.sla_policy_id
  WHERE c.tenant_id = ${tid} ORDER BY c.name
`;
for (const c of custs) console.log(`  ${c.name.padEnd(30)} tier=${(c.tier ?? '—').padEnd(10)} SLA=${c.sla ?? '—'}`);

console.log('\nInvoice summary (with margin):');
const inv = await sql<any[]>`
  SELECT i.invoice_number, i.status, i.due_date, i.total_cents,
    COALESCE(SUM(li.unit_cost_cents * li.quantity), 0)::int as total_cost_cents,
    c.name as customer
  FROM invoices i
  LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE i.tenant_id = ${tid}
  GROUP BY i.id, c.name
  ORDER BY i.invoice_number
`;
for (const i of inv) {
  const profit = (i.total_cents - i.total_cost_cents) / 100;
  const pct = i.total_cents > 0 ? Math.round((profit / (i.total_cents / 100)) * 100) : 0;
  const due = new Date(i.due_date).toLocaleDateString();
  const overdue = i.status === 'open' && new Date(i.due_date) < new Date() ? ' 🔴PAST DUE' : '';
  console.log(`  #${i.invoice_number} ${i.customer.padEnd(28)} $${(i.total_cents/100).toFixed(2).padStart(9)}  profit $${profit.toFixed(2).padStart(8)} (${pct}%)  due ${due}  [${i.status}]${overdue}`);
}

const [totals] = await sql<any[]>`
  SELECT
    SUM(i.total_cents)::bigint as revenue_cents,
    SUM(COALESCE(li.unit_cost_cents * li.quantity, 0))::bigint as cost_cents
  FROM invoices i
  LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
  WHERE i.tenant_id = ${tid}
`;
console.log(`\nTotal invoiced revenue: $${(Number(totals.revenue_cents) / 100).toFixed(2)}`);
console.log(`Total cost of goods:    $${(Number(totals.cost_cents) / 100).toFixed(2)}`);
console.log(`Gross profit:           $${((Number(totals.revenue_cents) - Number(totals.cost_cents)) / 100).toFixed(2)}`);

await sql.end();
