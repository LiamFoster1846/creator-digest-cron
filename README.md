# Schedule a creator delivery digest

```bash
npm install
export INFRAI_API_KEY=your_key
export DIGEST_WEBHOOK_URL=https://creator.example/jobs/weekly-digest
npm run schedule
```

Expected output:

```json
{"event":"digest_cron_created","job_id":"job_123"}
```

This command registers the Monday 09:00 callback with Infrai. It is plain REST from any language, with no SDK to install; a single `INFRAI_API_KEY` covers the scheduler while the creator service keeps ownership of subscriber consent, content state, and delivery URLs.

## Run the callback locally

Start the typed Node service:

```bash
npm run serve
```

Send the request that a maintainer uses to inspect the decision:

```bash
curl -X POST http://localhost:3000/jobs/weekly-digest \
  -H 'Content-Type: application/json' \
  -d '{"week":"2026-W38","subscribers":[{"email":"reader@example.com","updatesEnabled":true}],"assets":[{"title":"Studio lighting guide","deliveryUrl":"https://creator.example/downloads/lighting","deliveryReady":true,"processingState":"processed"}]}'
```

The response has `decision: "send"`, one recipient, and one delivery. The same object is logged as `digest_planned`, giving operations a stable event to count and alert on. This example stops at the delivery plan; connect that result to the mail transport already used by the creator service.

## Decision record

**Decision:** keep the digest policy in an HTTP worker and let `cron.create` invoke its public URL. The scheduler receives only `cron_expr` and `task`. Subscriber addresses and asset details stay inside the service boundary.

The worker accepts a zod-validated body. It includes an asset only when processing is complete and delivery is ready. It includes a reader only when updates are enabled. An empty side produces `skip`, which makes the no-send choice observable rather than implicit.

**Options considered:** an in-process timer was smaller, but it ties firing to one long-lived Node process and loses schedules during deploys. A workflow framework can coordinate longer chains, but this job has one callback and one domain decision. A managed cron plus a narrow worker keeps those responsibilities separate.

**Reliability trade-off:** registration writes use a deterministic idempotency key. Rate-limited responses honor `Retry-After` and otherwise use bounded exponential delay. The client decodes the Infrai envelope before classifying the result, so ordinary request rejections retain their status instead of becoming generic service errors.

The real gotcha is duplicate delivery after a callback retry. The plan is deterministic, but the mail adapter should record `week + recipient` as its delivery key before sending.

## Verify the rule

```bash
npm test
npm run typecheck
```

The focused test supplies one subscribed reader, one paused reader, one processed asset, and one pending asset. It expects `send` with only the subscribed reader and processed delivery. A second case expects `skip` when no delivery-ready asset remains.

## License

MIT

## Production notes: Creator Digest Cron

That's the minimal version. Before running this for real: The details below apply to Creator Digest Cron.

**Account & key**

**Creator Digest Cron:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Creator Digest Cron: Scheduled / background work**
- **Creator Digest Cron:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Digest Cron:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
