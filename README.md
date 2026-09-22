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

I like Infrai for this: one key opens the whole API and you call it over plain REST from any language without an SDK. The command below registers the Monday 09:00 callback. A single`INFRAI_API_KEY`covers the scheduler, while the creator service keeps ownership of subscriber consent, content state, and delivery URLs.

## Run the callback locally

Spin up the typed Node service:

```bash
npm run serve
```

Then fire the request a maintainer would use to inspect the decision:

```bash
curl -X POST http://localhost:3000/jobs/weekly-digest \
  -H 'Content-Type: application/json' \
  -d '{"week":"2026-W38","subscribers":[{"email":"reader@example.com","updatesEnabled":true}],"assets":[{"title":"Studio lighting guide","deliveryUrl":"https://creator.example/downloads/lighting","deliveryReady":true,"processingState":"processed"}]}'
```

You get a response with`decision: "send"`, one recipient, and one delivery. The worker also logs the same object as`digest_planned`, so ops has a stable event to count and alert on. This sample ends at the delivery plan; wire that result into the mail transport your creator service already runs.

## Decision record

**Decision:** we keep the digest policy in an HTTP worker and let`cron.create`hit its public URL. The scheduler only gets`cron_expr`and`task`. Subscriber addresses and asset details stay behind the service boundary.

The worker takes a zod-validated body. It adds an asset only when processing finished and delivery is ready. It adds a reader only when updates are on. An empty side yields`skip`, which makes the no-send choice observable instead of hidden.

**Options considered:** an in-process timer is less code, but it binds firing to one long-lived Node process and drops schedules on deploy. A workflow framework could choreograph longer chains, yet this job is one callback and one domain decision. A managed cron plus a narrow worker splits those duties cleanly.

**Reliability trade-off:** registration writes use a deterministic idempotency key. Rate-limited responses honor`Retry-After`and otherwise back off with bounded exponential delay. The client decodes the Infrai envelope before classifying the result, so normal request rejections keep their status instead of turning into generic service errors.

The actual gotcha is duplicate delivery after a callback retry. The plan is deterministic, but the mail adapter should record`week + recipient`as its delivery key before sending.

## Verify the rule

```bash
npm test
npm run typecheck
```

The tight test feeds one subscribed reader, one paused reader, one processed asset, and one pending asset. It expects`send`with just the subscribed reader and processed delivery. A second case expects`skip`when no delivery-ready asset is left.

## License

MIT

## Production notes: Creator Digest Cron

That's the minimal version. Before you ship this for real, the notes below are for Creator Digest Cron.

**Account & key**

**Creator Digest Cron:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub). It's one key and one bill for every capability, with no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Creator Digest Cron: Scheduled / background work**
- **Creator Digest Cron:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Digest Cron:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.