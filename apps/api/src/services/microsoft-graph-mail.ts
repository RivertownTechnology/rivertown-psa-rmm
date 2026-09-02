/**
 * Microsoft Graph mail — APP-ONLY (client-credentials) helper.
 *
 * Unlike the delegated Microsoft SSO flow (auth/microsoft-oauth.ts), this uses
 * an Entra application's own identity: a client-credentials grant yields an
 * app token that can send/read mail for any mailbox the app is granted
 * (Application permissions Mail.Send + Mail.ReadWrite, admin-consented).
 *
 * There is no refresh token in the client-credentials flow — when a cached
 * token expires we simply request a new one.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface GraphAppCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphMailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface GraphMailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: GraphMailAttachment[];
}

// --- In-memory app-token cache, keyed by tenantId + clientId ---
interface CachedToken { accessToken: string; expiresAt: number; }
const tokenCache = new Map<string, CachedToken>();

function cacheKey(creds: GraphAppCreds): string {
  return `${creds.tenantId}:${creds.clientId}`;
}

/**
 * Acquire an app-only Graph access token via the client-credentials grant.
 * Cached in memory until ~60s before expiry, then re-requested.
 */
export async function getGraphAppToken(creds: GraphAppCreds): Promise<string | null> {
  if (!creds.tenantId || !creds.clientId || !creds.clientSecret) {
    console.error('[MS-GRAPH] Missing app credentials (tenantId/clientId/clientSecret)');
    return null;
  }

  const key = cacheKey(creds);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`;
  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[MS-GRAPH] Token request failed (${res.status}):`, err.substring(0, 300));
      return null;
    }

    const tokens = await res.json() as { access_token: string; expires_in: number };
    tokenCache.set(key, {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    return tokens.access_token;
  } catch (err) {
    console.error('[MS-GRAPH] Token request error:', err);
    return null;
  }
}

/** Test-only helper to clear the in-memory token cache. */
export function _clearGraphTokenCache(): void {
  tokenCache.clear();
}

/**
 * Build the Graph message JSON payload for POST /sendMail.
 * Exported for unit testing the mapping.
 */
export function buildGraphMessage(options: GraphMailOptions): Record<string, unknown> {
  const message: Record<string, unknown> = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html || options.text || '',
    },
    toRecipients: [{ emailAddress: { address: options.to } }],
  };

  if (options.replyTo) {
    message.replyTo = [{ emailAddress: { address: options.replyTo } }];
  }

  if (options.attachments?.length) {
    message.attachments = options.attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: typeof a.content === 'string'
        ? Buffer.from(a.content).toString('base64')
        : a.content.toString('base64'),
    }));
  }

  return message;
}

/**
 * Send mail as `fromMailbox` via POST /users/{mailbox}/sendMail (app-only).
 * Returns true on success.
 */
export async function sendGraphMail(
  creds: GraphAppCreds,
  fromMailbox: string,
  options: GraphMailOptions,
): Promise<boolean> {
  const token = await getGraphAppToken(creds);
  if (!token) {
    console.error('[MS-GRAPH] No app token — Microsoft email not configured');
    return false;
  }
  if (!fromMailbox) {
    console.error('[MS-GRAPH] No from-mailbox configured');
    return false;
  }

  const message = buildGraphMessage(options);

  try {
    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    // sendMail returns 202 Accepted with no body on success
    if (res.status === 202 || res.ok) {
      return true;
    }

    const err = await res.text();
    console.error(`[MS-GRAPH] sendMail failed for ${fromMailbox} (${res.status}):`, err.substring(0, 300));
    return false;
  } catch (err) {
    console.error(`[MS-GRAPH] sendMail error for ${fromMailbox}:`, err);
    return false;
  }
}

// --- Inbound reading ---

export interface GraphInboxMessage {
  id: string;
  subject: string;
  isRead: boolean;
  internetMessageId: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
}

const INBOX_SELECT = 'id,subject,isRead,internetMessageId,from,toRecipients,body,bodyPreview';

/**
 * List unread messages in a mailbox's inbox (up to 25), with the fields
 * needed to create/update a ticket. Returns [] on error (logged).
 */
export async function listUnreadInboxMessages(
  creds: GraphAppCreds,
  mailbox: string,
): Promise<GraphInboxMessage[]> {
  const token = await getGraphAppToken(creds);
  if (!token) return [];

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
    + `?$filter=${encodeURIComponent('isRead eq false')}`
    + `&$top=25`
    + `&$select=${encodeURIComponent(INBOX_SELECT)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[MS-GRAPH] list unread failed for ${mailbox} (${res.status}):`, err.substring(0, 300));
      return [];
    }
    const data = await res.json() as { value?: GraphInboxMessage[] };
    return data.value ?? [];
  } catch (err) {
    console.error(`[MS-GRAPH] list unread error for ${mailbox}:`, err);
    return [];
  }
}

/** Mark a message read via PATCH /users/{mailbox}/messages/{id}. */
export async function markGraphMessageRead(
  creds: GraphAppCreds,
  mailbox: string,
  messageId: string,
): Promise<boolean> {
  const token = await getGraphAppToken(creds);
  if (!token) return false;

  try {
    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[MS-GRAPH] mark read failed for ${mailbox}/${messageId} (${res.status}):`, err.substring(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[MS-GRAPH] mark read error for ${mailbox}/${messageId}:`, err);
    return false;
  }
}

/**
 * Normalize a Graph inbox message into the sender/subject/body/messageId shape
 * that email-to-ticket's shared processEmail expects. Exported for testing.
 */
export function mapGraphMessage(msg: GraphInboxMessage): {
  graphId: string;
  messageId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
} {
  const fromAddress = (msg.from?.emailAddress?.address ?? '').trim().toLowerCase();
  const fromName = (msg.from?.emailAddress?.name ?? '').trim();
  const toAddress = (msg.toRecipients?.[0]?.emailAddress?.address ?? '').trim().toLowerCase();
  const isHtml = (msg.body?.contentType ?? '').toLowerCase() === 'html';
  const content = msg.body?.content ?? '';
  const bodyHtml = isHtml ? content : undefined;
  const bodyText = isHtml ? stripHtml(content) : (content || msg.bodyPreview || '');

  return {
    graphId: msg.id,
    // internetMessageId is the RFC Message-ID used for cross-provider dedupe;
    // fall back to the Graph id if absent.
    messageId: msg.internetMessageId || msg.id,
    fromAddress,
    fromName,
    toAddress,
    subject: msg.subject || '(No subject)',
    bodyText,
    bodyHtml,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
