# Rivertown Connect flow bridge

PSA API adapter for **Amazon Connect flow invocations**. This is not a Lex code
hook, an SNS subscriber, or a complete chatbot. It calls the existing PSA
`context`, `intake`, and `events` endpoints. No database changes are required.

## Create Lambda in us-east-1

1. AWS Lambda > Create function > Author from scratch.
2. Name: `rivertown-connect-bridge`.
3. Runtime: **Node.js 22.x**. Architecture: **x86_64**.
4. Permissions > Change default execution role > Use an existing role:
   `rivertown-connect-bridge-role`.
5. Create function.
6. Code > Upload from > .zip file > upload `dist/rivertown-connect-bridge.zip`.
   The two `.mjs` files must be at the ZIP root, not inside another folder.
7. Runtime settings > Handler: `index.handler`.
8. Configuration > General configuration > memory **256 MB**, timeout **8 seconds**.
9. Leave VPC unconfigured and function URL disabled. The function reaches the
   existing public PSA over HTTPS and is invoked directly by Connect.
10. Configuration > Environment variables > add exactly:

| Key | Value |
|---|---|
| `PSA_API_BASE_URL` | `https://psa.rivertowntechnology.com/api/v1` |
| `PSA_SECRET_ARN` | `arn:aws:secretsmanager:us-east-1:373468206662:secret:rivertown/prod/psa-connect-YljHfL` |
| `CONNECT_INSTANCE_ARN` | `arn:aws:connect:us-east-1:373468206662:instance/40adc64d-02a3-447b-a88a-14a741b5acd4` |

The existing secret must be JSON with an `apiToken` key containing the `rtc_...`
PSA integration credential. The execution role requires basic Lambda logging
permissions and `secretsmanager:GetSecretValue` on that exact secret. This setup
uses the default `aws/secretsmanager` key. It does not require AWS access keys in
environment variables. The bridge uses the AWS SDK v3 bundled in the Node.js 22
runtime, so its SDK minor version follows AWS runtime updates.

## First live test

Lambda > Test > Create new event > name `PsaContextSmokeTest`.
Paste `test-context.json`, save, and choose Test.

This is a synthetic Connect-format event. It verifies Secrets Manager access,
the PSA token, and the public API. It creates an unverified test identity and
conversation in the PSA; **it does not create a ticket or send an Apple message**.
Repeat the same fixture rather than generating new test IDs. It does not test
Connect's invocation permission or Apple delivery; those are later tests.

Expected result:

```json
{
  "result": "context_loaded",
  "conversationId": "<generated-PSA-UUID>",
  "verification": "unverified",
  "state": "bot"
}
```

The Lambda console can show a successful invocation even if the returned
`result` is `error`. Inspect the returned JSON, not just the green execution banner.

## Add Lambda to Connect

AWS Connect console > Instances > rivertowntech > Flows > AWS Lambda:
select `rivertown-connect-bridge` and add it to the instance. Ensure the resulting
Lambda resource policy allows `connect.amazonaws.com` to invoke this function
for the intended instance/account. The execution role alone does not grant that
invocation permission.

In the Connect admin site, open Routing > Flows > Rivertown Apple Support:

1. Add an **Invoke AWS Lambda function** block.
2. Select this Lambda. Use synchronous invocation, timeout **8 seconds**, and
   response validation **STRING_MAP** (flat string key/value pairs).
3. Add function input parameter `operation` = `context`.
4. On the success branch, check **External** `result` / `$.External.result`.
5. `context_loaded` continues into intake; `error` goes to a service-failure
   message and human/after-hours fallback. Connect's Error branch handles failures
   before the Lambda can return, including permission errors and hard timeouts.
6. Copy `conversationId` and `verification` into user-defined contact attributes
   with a Set contact attributes block if needed after another Lambda call.

The adapter requires the actual event's `ContactData.InstanceARN`, `ContactId`,
`Channel=CHAT`, and Apple attributes `MessagingPlatform=AppleBusinessChat` and
`AppleBusinessChatCustomerId`. A regular Connect website Test chat does not
have these Apple attributes and will return `unsupported_channel`. Do not
fabricate Apple identities in a production web-chat flow. Use the Lambda fixture
for the adapter smoke test; use an onboarded Apple tester for channel testing.

## Intake operation after the bot has collected the fields

Use the same Lambda block with these **function input parameters**:

| Parameter | Source |
|---|---|
| `operation` | Static `intake` |
| `requestId` | Persisted ID for this one issue, unchanged on retries |
| `subject` | Collected subject, max 500 characters |
| `description` | Collected issue description, max 12,000 characters |
| `name`, `company`, `email`, `device`, `impact` | Optional collected values |
| `priority` | low/medium/high/critical; medium by default |

For Lex, explicitly map bot slots/session attributes into these function input
parameters. This function does not elicit slots or infer arbitrary Lex fields.
Do not attach it directly as a Lex fulfillment Lambda: Lex uses a different
event/response format. The bot should finish collecting the intake and let the
Connect flow invoke this adapter.

For a simple first intake, a persisted value such as `<ContactId>:intake:1` is
sufficient. Increment the suffix only for a genuinely new issue. Preserve the
original fields across retries; never regenerate an ID on a timeout.

Branch on the returned result:

- `ticket_created`: use the actual `ticketNumber` in the confirmation.
- `intake_saved`: tell the customer the request was received and awaits review.
  It is not yet a ticket. See `docs/amazon-connect-api.md` for staff verification
  and conversion. Copy `intakeId` and `conversationId` into contact attributes.
- `error`: show the fallback and retain the same request ID for any retry.

## Events operation

Function parameters: `operation=events`, stable `requestId`, original
`occurredAt` (ISO timestamp), and `type`.

For `type=handoff`, pass `state=bot|queued|human|ended`.
For `type=message`, pass `sender=customer|agent|bot|system`, `text`, and optionally
`intakeRequestId` to associate the message with an intake's ticket.

The API records these events; invoking a flow does not automatically stream all
human/customer messages. A separate Connect streaming subscriber and durable
queue remain necessary for full transcript synchronization. This adapter does
not send replies or perform the transfer: Connect flow blocks do that.

## Errors and retry behavior

All returned values are strings. Failures return `result=error`, `errorCode`,
and `retryable=true|false`. No raw upstream error body, token, or customer text is
logged. A total 6-second deadline covers secret retrieval and the API call,
leaving time for Connect to process the response. SDK attempts are limited to one;
there is no hidden HTTP retry loop or automatic ticket retry inside this function.

| errorCode | Check/action |
|---|---|
| configuration_error | Environment variables and HTTPS API base URL |
| secret_unavailable | Role permissions, secret ARN/region; check service status if transient |
| invalid_secret | JSON key must be `apiToken` with the full `rtc_...` token |
| api_unauthorized | PSA credential revoked/incorrect; update Secrets Manager |
| api_not_deployed | Deploy the new PSA endpoints at the configured URL |
| invalid_request / invalid_operation | Function input mappings, field sizes, operation, event shape |
| wrong_instance / unsupported_channel | Source Connect instance and Apple channel attributes |
| api_conflict | Inspect prerequisite/order or changed request ID payload; do not blindly retry |
| api_rejected | PSA validation or permission failure |
| invalid_api_response | Response shape did not match the PSA contract |
| api_unavailable / network_error / timeout | Bounded retry with the SAME operation ID and payload, or fallback |

The secret is cached for 60 seconds. A PSA 401 invalidates the cache for the next
invocation. Keep the old PSA credential active while rotating the AWS secret,
test the replacement, then revoke the old credential. Avoid indefinite retries
in the contact flow; use a queue/worker for eventual delivery where needed.

## Local verification and packaging

From the repository root:

```powershell
node --test infrastructure/aws/connect-bridge/bridge.test.mjs
.\infrastructure\aws\connect-bridge\package.ps1
```

The test suite injects a fake Secrets Manager reader and fake HTTP responses; it
does not read the real secret or call production. The ZIP contains `index.mjs`
and `bridge.mjs` only. Deployment and the live smoke test are performed in AWS.

AWS references:
- https://docs.aws.amazon.com/connect/latest/adminguide/connect-lambda-functions.html
- https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html
- https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html
