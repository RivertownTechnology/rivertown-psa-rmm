// Connect flow adapter. No credentials or customer message bodies are logged.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^rtc_[A-Za-z0-9_-]{43}$/;
const ownObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

class BridgeError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

function required(value, max, isUuid = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (isUuid && !uuid.test(value))) {
    throw new BridgeError('invalid_request');
  }
  return value.trim();
}

export function toRequest(event, instanceArn) {
  const contact = event?.Details?.ContactData;
  const params = event?.Details?.Parameters;
  if (event?.Name !== 'ContactFlowEvent' || !ownObject(contact) || !ownObject(params)) throw new BridgeError('invalid_request');
  if (contact.InstanceARN !== instanceArn) throw new BridgeError('wrong_instance');
  if (contact.Channel !== 'CHAT' || contact.Attributes?.MessagingPlatform !== 'AppleBusinessChat') throw new BridgeError('unsupported_channel');
  // Identity comes exclusively from Connect metadata, never function input parameters.
  const body = {
    contactId: required(contact.ContactId, 36, true),
    appleCustomerId: required(contact.Attributes?.AppleBusinessChatCustomerId, 256),
  };
  const operation = params.operation;
  if (!['context', 'intake', 'events'].includes(operation)) throw new BridgeError('invalid_operation');
  if (operation === 'context') return { operation, body };
  body.requestId = required(params.requestId, 256);
  if (operation === 'intake') {
    body.subject = required(params.subject, 500);
    body.description = required(params.description, 12000);
    for (const [key, max] of Object.entries({ name: 200, company: 200, email: 254, device: 200, impact: 2000 })) {
      if (params[key] !== undefined && params[key] !== '') body[key] = required(params[key], max);
    }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new BridgeError('invalid_request');
    body.priority = params.priority || 'medium';
    if (!['low', 'medium', 'high', 'critical'].includes(body.priority)) throw new BridgeError('invalid_request');
  } else {
    body.type = params.type;
    body.occurredAt = required(params.occurredAt, 64);
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.occurredAt) || !Number.isFinite(Date.parse(body.occurredAt))) throw new BridgeError('invalid_request');
    if (body.type === 'message') {
      if (!['customer', 'agent', 'bot', 'system'].includes(params.sender)) throw new BridgeError('invalid_request');
      body.sender = params.sender;
      body.text = required(params.text, 16000);
      if (params.intakeRequestId) body.intakeRequestId = required(params.intakeRequestId, 256);
    } else if (body.type === 'handoff') {
      if (!['bot', 'queued', 'human', 'ended'].includes(params.state)) throw new BridgeError('invalid_request');
      body.state = params.state;
    } else throw new BridgeError('invalid_request');
  }
  if (Buffer.byteLength(JSON.stringify(body)) > 65536) throw new BridgeError('invalid_request');
  return { operation, body };
}

function flowResponse(operation, data) {
  if (!ownObject(data) || !uuid.test(data.conversationId ?? '')) throw new BridgeError('invalid_api_response');
  if (operation === 'context') {
    if (!['verified', 'unverified'].includes(data.verification) || !['bot', 'queued', 'human', 'ended'].includes(data.state)) throw new BridgeError('invalid_api_response');
    return { result: 'context_loaded', conversationId: data.conversationId, verification: data.verification, state: data.state };
  }
  if (operation === 'events') {
    if (data.result !== 'event_saved') throw new BridgeError('invalid_api_response');
    return { result: data.result, conversationId: data.conversationId };
  }
  if (!['ticket_created', 'intake_saved'].includes(data.result) || !uuid.test(data.intakeId ?? '')) throw new BridgeError('invalid_api_response');
  const result = { result: data.result, conversationId: data.conversationId, intakeId: data.intakeId };
  if (data.result === 'ticket_created') {
    if (!uuid.test(data.ticketId ?? '') || !/^\d+$/.test(String(data.ticketNumber ?? ''))) throw new BridgeError('invalid_api_response');
    result.ticketId = data.ticketId;
    result.ticketNumber = String(data.ticketNumber);
  }
  return result;
}

export function createHandler({ readSecret, env = process.env, fetchImpl = fetch, logger = console, now = Date.now }) {
  let cached;
  return async function handler(event, context = {}) {
    const started = now();
    let operation;
    let status;
    let timer;
    try {
      const base = new URL(env.PSA_API_BASE_URL);
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname.replace(/\/$/, '') !== '/api/v1') throw new BridgeError('configuration_error');
      if (!env.PSA_SECRET_ARN || !/^arn:aws:connect:[a-z0-9-]+:\d{12}:instance\/[0-9a-f-]{36}$/.test(env.CONNECT_INSTANCE_ARN ?? '')) throw new BridgeError('configuration_error');
      const request = toRequest(event, env.CONNECT_INSTANCE_ARN);
      operation = request.operation;
      const remaining = context.getRemainingTimeInMillis?.() ?? 8000;
      const budget = Math.min(6000, remaining - 1000);
      if (budget < 250) throw new BridgeError('timeout', true);
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), budget);
      let token;
      try {
        if (cached && cached.until > now()) token = cached.token;
        else {
          let secret;
          try { secret = JSON.parse(await readSecret(env.PSA_SECRET_ARN, controller.signal)); }
          catch (error) {
            if (controller.signal.aborted) throw new BridgeError('timeout', true);
            const transient = ['ThrottlingException', 'ServiceUnavailableException', 'InternalServiceError'].includes(error?.name);
            throw new BridgeError('secret_unavailable', transient);
          }
          if (!tokenPattern.test(secret?.apiToken ?? '')) throw new BridgeError('invalid_secret');
          token = secret.apiToken;
          cached = { token, until: now() + 60000 };
        }
        let response;
        try {
          response = await fetchImpl(`${base.href.replace(/\/$/, '')}/integrations/amazon-connect/${operation}`, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(request.body),
          });
          status = response.status;
          if (status === 401) { cached = undefined; throw new BridgeError('api_unauthorized'); }
          if (status === 404) throw new BridgeError('api_not_deployed');
          if (status === 409) throw new BridgeError('api_conflict');
          if (status === 429 || status >= 500) throw new BridgeError('api_unavailable', true);
          if (!response.ok) throw new BridgeError('api_rejected');
          let data;
          try { data = await response.json(); }
          catch { throw new BridgeError('invalid_api_response'); }
          const result = flowResponse(operation, data);
          logger.info({ event: 'psa_bridge_completed', operation, result: result.result, elapsedMs: now() - started });
          return result;
        } catch (error) {
          if (controller.signal.aborted) throw new BridgeError('timeout', true);
          if (error instanceof BridgeError) throw error;
          throw new BridgeError('network_error', true);
        }
      } finally { clearTimeout(timer); }
    } catch (error) {
      clearTimeout(timer);
      const code = error instanceof BridgeError ? error.code : 'configuration_error';
      const retryable = error instanceof BridgeError && error.retryable;
      // Do not log raw exceptions, event parameters, token, or upstream bodies.
      logger.error({ event: 'psa_bridge_failed', operation, code, status, elapsedMs: now() - started });
      return { result: 'error', errorCode: code, retryable: String(Boolean(retryable)) };
    }
  };
}
