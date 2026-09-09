import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';
import * as schema from '@rivertown/db';
import { createTestApp, authRequest } from '../../../test/helpers.js';
import { amazonConnectRoutes } from './routes.js';
import { hashToken } from './validation.js';
import { ticketRoutes } from '../../tickets/routes.js';
import { dispatchTicketCreated } from '../../../services/ticket-create.js';

// Ticket creation, SQL, SLA, auditing and route auth are real. Only external
// post-commit workflow/email delivery is replaced in this isolated test.
vi.mock('../../../services/ticket-create.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../services/ticket-create.js')>(),
  dispatchTicketCreated: vi.fn(),
}));

const base = '/api/v1/integrations/amazon-connect';
const tenantId = randomUUID(), otherTenantId = randomUUID(), userId = randomUUID();
const customerId = randomUUID(), contactId = randomUUID(), foreignContactId = randomUUID();
const appleBusinessId = randomUUID();
const instanceArn = `arn:aws:connect:us-east-1:123456789012:instance/${randomUUID()}`;
let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: Awaited<ReturnType<typeof createTestApp>>;
let token: string;
const staff = { tid: tenantId, sub: userId, role: 'admin' };
const call = (path: string, payload: unknown, bearer = token) => app.inject({ method: 'POST', url: `${base}${path}`, payload, headers: { authorization: `Bearer ${bearer}` } });
const admin = (path: string, payload?: unknown) => authRequest(app, { method: 'POST', url: `${base}${path}`, payload }, staff);
const context = () => ({ contactId: randomUUID(), appleCustomerId: `apple-${randomUUID()}` });

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  db = drizzle(pg, { schema });
  // Base-table fixture follows actual column types/defaults. The NEW tables
  // and indexes are created using the exact shipping SQL migration below.
  const dialect = new PgDialect();
  for (const table of [schema.tenants, schema.customers, schema.contacts, schema.contracts, schema.tickets, schema.ticketComments, schema.auditLog, schema.tenantSequences, schema.slaPolicies]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(c => {
      const value = c.default !== undefined && (c.dataType === 'json' || c.dataType === 'array') ? c.mapToDriverValue(c.default) : c.default;
      const defaultSql = value === undefined ? '' : ` DEFAULT ${dialect.sqlToQuery(sql`${value}`.inlineParams()).sql}`;
      return `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${defaultSql}`;
    });
    try { await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`); } catch (error) { throw new Error(`${name}: ${definitions.join(',')}`, { cause: error }); }
  }
  const migration = readFileSync(new URL('../../../../../../packages/db/src/migrations/0062_amazon_connect.sql', import.meta.url), 'utf8');
  const manualScript = readFileSync(new URL('../../../../../../scripts/sql/amazon-connect-pgadmin.sql', import.meta.url), 'utf8');
  await pg.exec(manualScript);
  await pg.exec(migration); // manual pgAdmin + later migration runner must be safe
  app = await createTestApp({ db, routes: async server => {
    await server.register(amazonConnectRoutes);
    await server.register(ticketRoutes);
  } });
}, 30000);

beforeEach(async () => {
  vi.mocked(dispatchTicketCreated).mockClear();
  await pg.exec('TRUNCATE connect_operations, connect_conversations, connect_identities, connect_credentials, ticket_comments, tickets, audit_log, tenant_sequences, sla_policies, contacts, customers, tenants CASCADE');
  // Keep seed fixtures independent of optional production customer fields.
  await db.insert(schema.tenants).values([{ id: tenantId, name: 'Rivertown', slug: 'rivertown' }, { id: otherTenantId, name: 'Other', slug: 'other' }]);
  await db.insert(schema.customers).values([{ id: customerId, tenantId, name: 'Customer' }, { id: otherTenantId, tenantId: otherTenantId, name: 'Other' }]);
  await db.insert(schema.contacts).values([
    { id: contactId, tenantId, customerId, firstName: 'Pat', lastName: 'Customer', email: 'pat@example.com' },
    { id: foreignContactId, tenantId: otherTenantId, customerId: otherTenantId, firstName: 'Other', lastName: 'Customer', email: 'other@example.com' },
  ]);
  await db.insert(schema.tenantSequences).values({ tenantId, sequenceName: 'ticket', currentValue: '100' });
  await db.insert(schema.slaPolicies).values({ tenantId, name: 'Default', isDefault: true });
  const response = await admin('/credentials', { name: 'Test bridge', appleBusinessId, instanceArn });
  expect(response.statusCode).toBe(201);
  token = response.json().token;
});

afterAll(async () => { await app?.close(); await pg?.close(); });

describe('Amazon Connect API', () => {
  it('stores only the token hash and never returns it in credential listings', async () => {
    const [row] = await db.select().from(schema.connectCredentials);
    expect(row.tokenHash).toBe(hashToken(token));
    const listing = await authRequest(app, { method: 'GET', url: `${base}/credentials` }, staff);
    expect(listing.statusCode).toBe(200);
    expect(listing.body).not.toContain(token);
    expect(listing.body).not.toContain(row.tokenHash);
  });

  it('requires machine authentication on every machine route, including malformed bodies', async () => {
    for (const path of ['/context', '/intake', '/events']) {
      const missing = await app.inject({ method: 'POST', url: `${base}${path}`, payload: {} });
      expect(missing.statusCode).toBe(401);
      expect((await call(path, {}, `rtc_${'x'.repeat(43)}`)).statusCode).toBe(401);
      expect((await authRequest(app, { method: 'POST', url: `${base}${path}`, payload: {} }, staff)).statusCode).toBe(401);
    }
  });

  it('restricts credential administration to staff administrators, and revokes immediately', async () => {
    const payload = { name: 'Denied', appleBusinessId, instanceArn };
    expect((await call('/credentials', payload)).statusCode).toBe(401);
    expect((await authRequest(app, { method: 'POST', url: `${base}/credentials`, payload }, { ...staff, role: 'tech' })).statusCode).toBe(403);
    const [row] = await db.select().from(schema.connectCredentials);
    expect((await authRequest(app, { method: 'DELETE', url: `${base}/credentials/${row.id}` }, { ...staff, tid: otherTenantId })).statusCode).toBe(404);
    expect((await authRequest(app, { method: 'DELETE', url: `${base}/credentials/${row.id}` }, staff)).statusCode).toBe(204);
    expect((await call('/context', context())).statusCode).toBe(401);
  });

  it('saves unknown intake without trusting typed email and rejects caller-selected tenant/customer IDs', async () => {
    const body = { ...context(), requestId: 'intake-1', subject: 'Help', description: 'Printer offline', email: 'pat@example.com' };
    const response = await call('/intake', body);
    expect(response.statusCode).toBe(200);
    expect(response.json().result).toBe('intake_saved');
    expect(await db.select().from(schema.tickets)).toHaveLength(0);
    expect((await call('/intake', { ...body, customerId })).statusCode).toBe(400);
    expect((await call('/context', { ...context(), tenantId: otherTenantId })).statusCode).toBe(400);
    expect((await call('/events', { ...context(), requestId: 'bad', occurredAt: new Date().toISOString(), type: 'message' })).statusCode).toBe(400);
  });

  it('deduplicates concurrent intake, rejects changed replay, and protects contact/identity binding', async () => {
    const body = { ...context(), requestId: 'same', subject: 'Help', description: 'Offline' };
    const results = await Promise.all([call('/intake', body), call('/intake', body)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect(await db.select().from(schema.connectOperations)).toHaveLength(1);
    expect((await call('/intake', { ...body, description: 'Different' })).statusCode).toBe(409);
    expect((await call('/context', { contactId: body.contactId, appleCustomerId: 'another' })).statusCode).toBe(409);
  });

  it('creates one ticket and dispatches once for concurrent verified intake', async () => {
    const body = { ...context(), requestId: 'same-ticket', subject: 'Help', description: 'Offline' };
    const ctx = (await call('/context', bodyContact(body))).json();
    await admin(`/conversations/${ctx.conversationId}/verification`, { contactId, note: 'Verified by phone callback' });
    const results = await Promise.all([call('/intake', body), call('/intake', body)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect(await db.select().from(schema.tickets)).toHaveLength(1);
    expect(vi.mocked(dispatchTicketCreated)).toHaveBeenCalledTimes(1);
  });

  it('preserves manual ticket creation through the shared service', async () => {
    const response = await authRequest(app, { method: 'POST', url: '/api/v1/tickets', payload: { customerId, contactId, subject: 'Manual ticket' } }, staff);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ ticketNumber: 101, source: 'manual', customerId, contactId });
    expect(response.json().slaDueAt).toBeTruthy();
    expect(vi.mocked(dispatchTicketCreated)).toHaveBeenCalledTimes(1);
  });

  it('verifies only tenant-owned contacts, converts once with SLA/audit, and remembers returning identities', async () => {
    const body = { ...context(), requestId: 'new', subject: 'Help', description: 'Offline' };
    const intake = (await call('/intake', body)).json();
    expect((await admin(`/conversations/${intake.conversationId}/verification`, { contactId: foreignContactId, note: 'Verified by phone callback' })).statusCode).toBe(404);
    expect((await admin(`/intakes/${intake.intakeId}/convert`)).statusCode).toBe(409);
    expect((await admin(`/conversations/${intake.conversationId}/verification`, { contactId, note: 'Verified by phone callback' })).statusCode).toBe(200);
    const converted = await admin(`/intakes/${intake.intakeId}/convert`);
    expect(converted.statusCode).toBe(200);
    expect(converted.json().ticketNumber).toBe('101');
    expect((await admin(`/intakes/${intake.intakeId}/convert`)).json()).toEqual(converted.json());
    expect((await call('/intake', body)).json()).toEqual(converted.json());
    const [ticket] = await db.select().from(schema.tickets);
    expect(ticket.source).toBe('apple_messages');
    expect(ticket.contactId).toBe(contactId);
    expect(ticket.slaDueAt).toBeInstanceOf(Date);
    expect((await db.select().from(schema.auditLog)).some(r => r.action === 'ticket.created')).toBe(true);
    const returning = await call('/context', { contactId: randomUUID(), appleCustomerId: body.appleCustomerId });
    expect(returning.json().verification).toBe('verified');
    const next = await call('/intake', { ...body, contactId: randomUUID(), requestId: 'next' });
    expect(next.json().ticketNumber).toBe('102');
  });

  it('rolls back operation and ticket number if ticket creation fails', async () => {
    const body = { ...context(), requestId: 'retry', subject: 'Help', description: 'Offline' };
    const ctx = (await call('/context', bodyContact(body))).json();
    await admin(`/conversations/${ctx.conversationId}/verification`, { contactId, note: 'Verified by phone callback' });
    await pg.exec("ALTER TABLE tickets ADD CONSTRAINT test_failure CHECK (subject <> 'Help')");
    expect((await call('/intake', body)).statusCode).toBe(500);
    expect(await db.select().from(schema.connectOperations)).toHaveLength(0);
    expect((await db.select().from(schema.tenantSequences))[0].currentValue).toBe('100');
    await pg.exec('ALTER TABLE tickets DROP CONSTRAINT test_failure');
    expect((await call('/intake', body)).json().ticketNumber).toBe('101');
  });

  it('retains pre-verification messages, deduplicates comments, and ignores stale handoff state', async () => {
    const body = { ...context(), requestId: 'intake', subject: 'Help', description: 'Offline' };
    const intake = (await call('/intake', body)).json();
    const message = { ...bodyContact(body), requestId: 'msg-1', intakeRequestId: 'intake', occurredAt: '2026-01-01T12:00:00Z', type: 'message', sender: 'customer', text: 'More details' };
    expect((await call('/events', message)).statusCode).toBe(200);
    expect((await call('/events', message)).statusCode).toBe(200);
    await admin(`/conversations/${intake.conversationId}/verification`, { contactId, note: 'Verified by phone callback' });
    await admin(`/intakes/${intake.intakeId}/convert`);
    expect(await db.select().from(schema.ticketComments)).toHaveLength(1);
    await call('/events', message);
    await call('/events', { ...message, requestId: 'msg-2', sender: 'agent', text: 'Checking now' });
    const comments = await db.select().from(schema.ticketComments);
    expect(comments).toHaveLength(2);
    expect(comments.every(c => c.isInternal)).toBe(true);
    await call('/events', { ...bodyContact(body), requestId: 'h1', type: 'handoff', state: 'human', occurredAt: '2026-01-01T12:05:00Z' });
    await call('/events', { ...bodyContact(body), requestId: 'h2', type: 'handoff', state: 'queued', occurredAt: '2026-01-01T12:00:00Z' });
    expect((await call('/context', bodyContact(body))).json().state).toBe('human');
    expect((await call('/events', { ...message, requestId: 'early', intakeRequestId: 'not-arrived' })).statusCode).toBe(409);
  });

  it('protects review and conversion from other tenants and machine credentials', async () => {
    const intake = (await call('/intake', { ...context(), requestId: 'private', subject: 'Private', description: 'Private' })).json();
    expect((await call(`/intakes/${intake.intakeId}/convert`, {})).statusCode).toBe(401);
    const listing = await authRequest(app, { method: 'GET', url: `${base}/intakes` }, { ...staff, tid: otherTenantId });
    expect(listing.json()).toEqual([]);
    expect((await authRequest(app, { method: 'POST', url: `${base}/intakes/${intake.intakeId}/convert` }, { ...staff, tid: otherTenantId })).statusCode).toBe(404);
    expect((await authRequest(app, { method: 'GET', url: `${base}/conversations/${intake.conversationId}/events` }, { ...staff, tid: otherTenantId })).statusCode).toBe(404);
    const [credential] = await db.select().from(schema.connectCredentials);
    await db.update(schema.connectCredentials).set({ tenantId: otherTenantId }).where(eq(schema.connectCredentials.id, credential.id));
    expect((await call('/context', context())).json().verification).toBe('unverified');
  });
});

function bodyContact(body: { contactId: string; appleCustomerId: string }) { return { contactId: body.contactId, appleCustomerId: body.appleCustomerId }; }
