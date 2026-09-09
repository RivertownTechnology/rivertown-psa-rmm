import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, toRequest } from './bridge.mjs';

const contactId = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const intakeId = '00000000-0000-4000-8000-000000000003';
const ticketId = '00000000-0000-4000-8000-000000000004';
const instanceArn = `arn:aws:connect:us-east-1:123456789012:instance/${contactId}`;
const env = { CONNECT_INSTANCE_ARN: instanceArn, PSA_SECRET_ARN: 'test-secret', PSA_API_BASE_URL: 'https://psa.example.com/api/v1' };
const token = `rtc_${'a'.repeat(43)}`;
function event(parameters = { operation: 'context' }) {
  return { Name: 'ContactFlowEvent', Details: { ContactData: { InstanceARN: instanceArn, Channel: 'CHAT', ContactId: contactId,
    Attributes: { MessagingPlatform: 'AppleBusinessChat', AppleBusinessChatCustomerId: 'opaque-apple-id' } }, Parameters: parameters } };
}
function setup(options = {}) {
  const calls = [], logs = [];
  let reads = 0;
  const handler = createHandler({ env, readSecret: async () => { reads++; return JSON.stringify({ apiToken: token }); },
    logger: { info: v => logs.push(v), error: v => logs.push(v) },
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); return Response.json({ conversationId, verification: 'unverified', state: 'bot' }); },
    ...options });
  return { handler, calls, logs, reads: () => reads };
}

test('context uses trusted metadata and only returns a flat string map', async () => {
  const s = setup();
  const result = await s.handler(event({ operation: 'context', appleCustomerId: 'forged', contactId: 'forged', apiToken: 'forged' }));
  assert.equal(result.result, 'context_loaded');
  assert.ok(Object.values(result).every(v => typeof v === 'string'));
  assert.deepEqual(JSON.parse(s.calls[0].body), { contactId, appleCustomerId: 'opaque-apple-id' });
  assert.equal(s.calls[0].headers.Authorization, `Bearer ${token}`);
  assert.equal(s.calls[0].redirect, 'error');
  assert.equal(s.calls[0].url, 'https://psa.example.com/api/v1/integrations/amazon-connect/context');
  assert.ok(!JSON.stringify(s.logs).includes(token));
});

test('wrong instance and non-Apple contacts cannot access the secret/API', async () => {
  const s = setup();
  const wrong = event(); wrong.Details.ContactData.InstanceARN = 'other';
  assert.equal((await s.handler(wrong)).errorCode, 'wrong_instance');
  const web = event(); delete web.Details.ContactData.Attributes.MessagingPlatform;
  assert.equal((await s.handler(web)).errorCode, 'unsupported_channel');
  assert.equal(s.reads(), 0); assert.equal(s.calls.length, 0);
});

test('validates required intake fields, operation, and real ContactId before sending', async () => {
  const s = setup();
  assert.equal((await s.handler(event({ operation: 'delete' }))).errorCode, 'invalid_operation');
  assert.equal((await s.handler(event({ operation: 'intake', subject: 'Help', description: 'Offline' }))).errorCode, 'invalid_request');
  const bad = event(); bad.Details.ContactData.ContactId = 'not-a-uuid';
  assert.equal((await s.handler(bad)).errorCode, 'invalid_request');
  assert.equal(s.calls.length, 0);
});

test('intake retries send exactly the same request ID and payload', async () => {
  const sent = [];
  const s = setup({ fetchImpl: async (_url, init) => {
    sent.push(init.body); return Response.json({ result: 'ticket_created', conversationId, intakeId, ticketId, ticketNumber: '101' });
  } });
  const e = event({ operation: 'intake', requestId: 'intake-1', subject: 'Printer', description: 'Offline', email: 'pat@example.com', customerId: 'forged', verified: 'true' });
  assert.equal((await s.handler(e)).ticketNumber, '101');
  await s.handler(e);
  assert.equal(sent[0], sent[1]);
  assert.equal(JSON.parse(sent[0]).requestId, 'intake-1');
  assert.ok(!sent[0].includes('forged'));
});

test('unverified intake never fabricates a ticket number', async () => {
  const s = setup({ fetchImpl: async () => Response.json({ result: 'intake_saved', conversationId, intakeId }) });
  const result = await s.handler(event({ operation: 'intake', requestId: 'i1', subject: 'Help', description: 'Details' }));
  assert.equal(result.result, 'intake_saved'); assert.equal(result.ticketNumber, undefined);
});

test('API failures cannot appear as ticket creation and logs exclude upstream content', async () => {
  for (const [status, code, retryable] of [[401, 'api_unauthorized', 'false'], [404, 'api_not_deployed', 'false'], [409, 'api_conflict', 'false'], [429, 'api_unavailable', 'true'], [500, 'api_unavailable', 'true']]) {
    const s = setup({ fetchImpl: async () => new Response(`PRIVATE ${token}`, { status }) });
    assert.deepEqual(await s.handler(event()), { result: 'error', errorCode: code, retryable });
    assert.ok(!JSON.stringify(s.logs).includes('PRIVATE'));
  }
});

test('secret cache expires and is invalidated after a 401', async () => {
  let now = 0, status = 200;
  const s = setup({ now: () => now, fetchImpl: async () => status === 200
    ? Response.json({ conversationId, verification: 'unverified', state: 'bot' }) : new Response('', { status }) });
  await s.handler(event()); await s.handler(event()); assert.equal(s.reads(), 1);
  now = 61000; await s.handler(event()); assert.equal(s.reads(), 2);
  status = 401; await s.handler(event()); status = 200; await s.handler(event()); assert.equal(s.reads(), 3);
});

test('invalid token or inaccessible secret fails without making an API call', async () => {
  const s = setup({ readSecret: async () => JSON.stringify({ apiToken: 'wrong' }) });
  assert.equal((await s.handler(event())).errorCode, 'invalid_secret'); assert.equal(s.calls.length, 0);
  const denied = setup({ readSecret: async () => { throw new Error('DO NOT LOG SECRET'); } });
  assert.equal((await denied.handler(event())).errorCode, 'secret_unavailable');
  assert.ok(!JSON.stringify(denied.logs).includes('DO NOT LOG'));
});

test('rejects non-HTTPS or malformed API destinations before reading secrets', async () => {
  for (const url of ['http://psa.example.com/api/v1', 'https://user:pass@example.com/api/v1', 'https://example.com/api/v1?token=x']) {
    const s = setup({ env: { ...env, PSA_API_BASE_URL: url } });
    assert.equal((await s.handler(event())).errorCode, 'configuration_error'); assert.equal(s.reads(), 0);
  }
});

test('aborts slow network requests before the Connect timeout', async () => {
  const s = setup({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  assert.deepEqual(await s.handler(event(), { getRemainingTimeInMillis: () => 1300 }), { result: 'error', errorCode: 'timeout', retryable: 'true' });
});

test('rejects malformed success responses rather than telling the customer it worked', async () => {
  const s = setup({ fetchImpl: async () => Response.json({ result: 'ticket_created' }) });
  assert.equal((await s.handler(event())).errorCode, 'invalid_api_response');
});

test('event IDs and timestamps are preserved; message and handoff fields are separated', () => {
  const params = { operation: 'events', requestId: 'event-1', occurredAt: '2026-09-09T18:00:00Z', type: 'handoff', state: 'human' };
  assert.deepEqual(toRequest(event(params), instanceArn).body, { contactId, appleCustomerId: 'opaque-apple-id', requestId: 'event-1', occurredAt: params.occurredAt, type: 'handoff', state: 'human' });
  const message = toRequest(event({ ...params, type: 'message', sender: 'customer', text: 'More details', intakeRequestId: 'intake-1' }), instanceArn).body;
  assert.equal(message.state, undefined); assert.equal(message.intakeRequestId, 'intake-1');
});
