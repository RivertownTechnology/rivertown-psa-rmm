import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const tid = 'd35afbb7-6ed0-4fb6-8f0b-b6b5ab915838';

// Find invoices without any line items and add a matching one
const orphanInvoices = await sql<any[]>`
  SELECT i.id, i.invoice_number, i.total_cents, i.customer_id, c.custom_fields->>'account_tier' as tier
  FROM invoices i
  LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
  JOIN customers c ON c.id = i.customer_id
  WHERE i.tenant_id = ${tid} AND li.id IS NULL
`;

console.log(`Found ${orphanInvoices.length} invoices without line items`);

const MARGIN_BY_TIER: Record<string, number> = {
  bronze: 0.30, silver: 0.37, gold: 0.45, platinum: 0.52, prospect: 0.20,
};

for (const inv of orphanInvoices) {
  const margin = MARGIN_BY_TIER[(inv.tier ?? 'gold').toLowerCase()] ?? 0.40;
  const cost = Math.round(inv.total_cents * (1 - margin));
  await sql`
    INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit_price_cents, unit_cost_cents, total_cents)
    VALUES (${tid}, ${inv.id}, ${'Managed IT services — recovered line item'}, 1, ${inv.total_cents}, ${cost}, ${inv.total_cents})
  `;
  console.log(`  #${inv.invoice_number}: added line ($${(inv.total_cents/100).toFixed(2)} with cost $${(cost/100).toFixed(2)})`);
}

await sql.end();
