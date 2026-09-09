# Amazon Connect API deployment and usage

This change implements the PSA backend only. It does not deploy AWS resources,
link Apple, add an inbox UI, implement customer OAuth, or send replies to Apple.
Lambda must call these endpoints using the contract below. Connect and Lex
continue to own the live chat and human handoff.

## 1. Database: run in pgAdmin before deploying the new API

1. Select the **existing Rivertown PSA database**, then open Query Tool.
2. Open `scripts/sql/amazon-connect-pgadmin.sql` from this repository.
3. Execute the **whole file**. It wraps the additive migration in BEGIN/COMMIT.
4. Confirm the final result shows four non-null table names.
5. If an error occurs, run `ROLLBACK;`, inspect the error, and correct it before retrying.

The file creates `connect_credentials`, `connect_identities`,
`connect_conversations`, and `connect_operations`, with their indexes. It does
not change existing customers/tickets or generate credentials. No placeholders
need editing. It is safe to rerun after a successful installation. These tables
retain customer text, so include them in the normal PSA database backup and
retention process.

The same DDL is registered as Drizzle migration `0062_amazon_connect`.
**You do not need to run `pnpm db:generate` or `pnpm db:migrate` when using the
pgAdmin script.** The manual script does not modify Drizzle's migration journal;
if the normal migrator runs later, the idempotent DDL safely executes again.
Use your existing migration deployment process for older unrelated migrations.

## 2. Deploy the application

Deploy the updated API and its `@rivertown/db` and `@rivertown/shared` workspace
packages using the normal application deployment. The lockfile includes a
test-only PGlite dependency; production uses the existing PostgreSQL connection.
No new API environment variables or database credentials are required.

Checks:

```powershell
Invoke-RestMethod https://psa.rivertowntechnology.com/health
```

`POST /api/v1/integrations/amazon-connect/context` without a credential should
return 401. A 404 means the updated routes are not deployed. A valid request
returning a missing-relation error means the SQL migration has not been applied
to the database used by that API instance.

## 3. Create the machine credential

You need your Apple **Messages for Business Account ID** and your new
**us-east-1 Connect instance ARN**. This credential is bound to those values and
the logged-in administrator's tenant. Use the Apple account ID, not an Apple ID
email, Apple token, or AWS account number.

Run from the repository root:

```powershell
.\scripts\configure-amazon-connect.ps1 `
  -AppleBusinessId '<APPLE-BUSINESS-ACCOUNT-UUID>' `
  -InstanceArn 'arn:aws:connect:us-east-1:<AWS-ACCOUNT-ID>:instance/<INSTANCE-UUID>'
```

The script prompts for a **current PSA owner/admin access JWT**. For the current
web app, sign in normally (including MFA), open browser Developer Tools >
Application > Local Storage > your PSA origin, and copy `accessToken`. Paste it
only into the script's hidden prompt. This short-lived JWT is used to create the
integration credential; Lambda must never use it. Do not use the refresh token.

The script prints the new integration token once. Put it into AWS Secrets
Manager as the `apiToken` key in `rivertown/prod/psa-connect`. Keep the credential
ID for revocation. Avoid running with PowerShell transcription enabled since
the one-time token is intentionally displayed. No token is written to a file.

Alternative HTTP request (owner/admin bearer JWT):

```http
POST /api/v1/integrations/amazon-connect/credentials
Authorization: Bearer <PSA-ADMIN-ACCESS-JWT>
Content-Type: application/json

{
  "name": "Amazon Connect production",
  "appleBusinessId": "<APPLE-BUSINESS-ACCOUNT-UUID>",
  "instanceArn": "arn:aws:connect:us-east-1:<AWS-ACCOUNT-ID>:instance/<INSTANCE-UUID>"
}
```

Response: 201 with `id`, `name`, `createdAt`, and one-time `token`.
Only a SHA-256 hash is stored in PostgreSQL; the random token has 256 bits of
entropy. `GET .../credentials` returns metadata only. `DELETE .../credentials/:id`
revokes a credential (204); it does not erase audit/history. Rotation is create
replacement -> update AWS secret -> test -> revoke old credential. Requests
already authenticated when revocation occurs may finish.

## 4. Lambda request contract

Base: `https://psa.rivertowntechnology.com/api/v1/integrations/amazon-connect`

All three machine endpoints require:

```http
Authorization: Bearer <rtc_...integration-token>
Content-Type: application/json
```

Use Connect's actual `ContactId` for `contactId`, and
`AppleBusinessChatCustomerId` for `appleCustomerId`. Lambda must obtain these
from the trusted Connect event, never from customer-entered text. The token's
stored instance ARN and Apple business ID supply the remaining scope. Unknown
fields (including `tenantId`, `customerId`, `ticketId`, or `verified`) are rejected.
The machine credential is trusted to relay channel identities; it is not an
independent proof that a request originated in AWS. Protect it in Secrets Manager.

### Context

```http
POST /context

{
  "contactId": "<CONNECT-CONTACT-UUID>",
  "appleCustomerId": "<APPLE-OPAQUE-CUSTOMER-ID>"
}
```

Response (200):

```json
{
  "conversationId": "<PSA-CONVERSATION-UUID>",
  "verification": "unverified",
  "state": "bot"
}
```

Creates/loads the contact's conversation; a returning Apple identity keeps its
staff-verified mapping across new Connect contacts. This endpoint does not
disclose existing ticket details or automatically configure Connect persistent
chat. A Connect contact cannot be reassigned to a different Apple identity.

### Intake

```http
POST /intake

{
  "contactId": "<CONNECT-CONTACT-UUID>",
  "appleCustomerId": "<APPLE-OPAQUE-CUSTOMER-ID>",
  "requestId": "<STABLE-INTAKE-UUID>",
  "subject": "Printer offline",
  "description": "The front desk printer stopped working this morning.",
  "name": "Pat Customer",
  "company": "Example Company",
  "email": "pat@example.com",
  "device": "FRONTDESK-PC",
  "impact": "One employee cannot print invoices",
  "priority": "medium"
}
```

Required: channel IDs, requestId, subject, description. Optional: name, company,
email, device, impact, priority (low/medium/high/critical; defaults to medium).
Company/email are reported information, **not identity verification**.

Unverified result (200): `result: intake_saved`, `conversationId`, `intakeId`.
Tell the customer their request was received and awaits review; do not promise
a ticket number. The pending-intake API below is how staff retrieve it.

Verified result (200): `result: ticket_created`, `conversationId`, `intakeId`,
`ticketId`, and string `ticketNumber`. Uses source `apple_messages`. Ticket
creation, SLA calculation, audit entry, sequence increment, and saved response
share one database transaction. Existing workflow/email notifications run after
commit, with the same best-effort delivery model as ordinary ticket creation;
they are not a durable notification outbox.

Persist requestId in the bot/session until the operation is complete. Reuse the
same requestId AND payload after a timeout. Changed content under an existing
requestId returns 409. A new support issue requires a new requestId; one Connect
contact can have several intakes. After staff conversion, retrying the original
intake returns its updated `ticket_created` result.

### Events

```http
POST /events

{
  "contactId": "<CONNECT-CONTACT-UUID>",
  "appleCustomerId": "<APPLE-OPAQUE-CUSTOMER-ID>",
  "requestId": "<CONNECT-MESSAGE-ID>",
  "intakeRequestId": "<STABLE-INTAKE-UUID>",
  "occurredAt": "2026-09-08T18:30:00Z",
  "type": "message",
  "sender": "customer",
  "text": "The printer has a flashing red light."
}
```

Senders: customer/agent/bot/system. `intakeRequestId` is optional; without it the
message is saved in conversation history only. With it, the message is mirrored
as an **internal transcript comment** on that intake's ticket. It never sends
email or an Apple reply. Messages arriving before verification remain stored
and are copied into internal comments when that intake is converted. An event
referencing an intake not received yet returns 409; queue and retry it later.

Handoff event:

```json
{
  "contactId": "<CONNECT-CONTACT-UUID>",
  "appleCustomerId": "<APPLE-OPAQUE-CUSTOMER-ID>",
  "requestId": "<STABLE-EVENT-ID>",
  "occurredAt": "2026-09-08T18:31:00Z",
  "type": "handoff",
  "state": "human"
}
```

States: bot/queued/human/ended. Handoff requests cannot contain message fields.
Older handoff events remain in history but do not overwrite newer state.
Ending a conversation does not resolve its ticket. Event retries are deduplicated
by conversation + event ID, and original timestamps are retained. The API stores
events; configure a Lambda/queue bridge separately to deliver them from Connect.
Attachment upload/download and transcript-file retrieval are not implemented by
this API; do not put binary files or S3 credentials in text payloads.

### Error handling

400: invalid fields; correct the request. 401: missing/invalid/revoked token.
403: staff permissions insufficient. 404: staff resource not found in tenant.
409: changed idempotency payload, wrong identity association, pending prerequisite,
or verification needed (read the message). Retry only pending prerequisites.
429: rate limit; back off. 5xx/timeouts: queue and retry the identical request.
The API has a 64 KiB body limit on machine routes and the existing global rate
limit. Never change IDs merely to bypass errors, or announce ticket success
before receiving `ticket_created`.

## 5. Staff review (PSA JWT, not machine token)

Owner/admin can manage credentials. Staff with `tickets:write` can review,
verify, and convert intake; portal users and machine credentials cannot.

| Method/path relative to integration base | Purpose |
|---|---|
| GET `/intakes?pending=true&limit=50&offset=0` | Pending intake records, including captured fields |
| GET `/intakes?pending=false&limit=50&offset=0` | All intakes |
| GET `/conversations/:id/events?limit=50&offset=0` | Stored events, newest received first; use occurredAt for event chronology |
| POST `/conversations/:id/verification` | Verify/revoke Apple-to-PSA contact mapping |
| POST `/intakes/:id/convert` | Convert a verified intake into a ticket, once |

After verifying the customer's identity using your actual support procedure:

```json
{
  "contactId": "<EXISTING-PSA-CONTACT-UUID>",
  "note": "Verified through callback to the contact's existing number."
}
```

POST this to `/conversations/<conversationId>/verification`. The server checks
that the contact AND its customer belong to your tenant. Then POST to
`/intakes/<intakeId>/convert` with no body. This returns the ticket result. Every
intake is converted separately; verification alone does not create tickets.

To revoke identity verification, submit `contactId: null` and an explanatory
note. Verification applies to that Apple identity across its conversations in
the same business and tenant. Reassigning a verified identity requires care;
existing ticket associations are checked before new comments are written.

There is no new settings/review page in this backend-only change. Use an HTTP
client with a current staff JWT until the planned inbox UI is implemented.

## Validation performed

Run `pnpm --filter @rivertown/api exec vitest run src/modules/integrations/amazon-connect/amazon-connect.test.ts`.
Tests use an isolated in-memory PGlite PostgreSQL engine; no .env database is
opened. They exercise SQL transactions and the actual Fastify routes. PGlite
serializes access; this does not replace a multi-connection load test against
PostgreSQL 16 before scaling production traffic.
