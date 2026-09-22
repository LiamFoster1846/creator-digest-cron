import assert from "node:assert/strict";
import test from "node:test";
import { digestRequestSchema, planDigest } from "../src/digest_worker";

test("sends only processed, delivery-ready assets to subscribed readers", () => {
  const input = digestRequestSchema.parse({
    week: "2026-W38",
    subscribers: [
      { email: "reader@example.com", updatesEnabled: true },
      { email: "paused@example.com", updatesEnabled: false }
    ],
    assets: [
      {
        title: "Studio lighting guide",
        deliveryUrl: "https://creator.example/downloads/lighting",
        deliveryReady: true,
        processingState: "processed"
      },
      {
        title: "Unfinished LUT pack",
        deliveryUrl: "https://creator.example/downloads/luts",
        deliveryReady: true,
        processingState: "pending"
      }
    ]
  });

  assert.deepEqual(planDigest(input), {
    week: "2026-W38",
    recipients: ["reader@example.com"],
    deliveries: [
      {
        title: "Studio lighting guide",
        deliveryUrl: "https://creator.example/downloads/lighting"
      }
    ],
    decision: "send"
  });
});

test("skips a digest when no processed delivery is ready", () => {
  const input = digestRequestSchema.parse({
    week: "2026-W38",
    subscribers: [{ email: "reader@example.com", updatesEnabled: true }],
    assets: [
      {
        title: "Editing checklist",
        deliveryUrl: "https://creator.example/downloads/checklist",
        deliveryReady: false,
        processingState: "processed"
      }
    ]
  });

  assert.equal(planDigest(input).decision, "skip");
});
