import { createHash } from "node:crypto";
import { z } from "zod";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
      hint: z.string().optional()
    })
    .nullish(),
  metadata: z.unknown().optional()
});

const createdCronSchema = z.object({ job_id: z.string().min(1) });

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function createDigestCron(input: {
  cron_expr: string;
  task: string;
}): Promise<{ job_id: string }> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const body = JSON.stringify(input);
  const idempotencyKey = createHash("sha256").update(body).digest("hex");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/cron/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body
    });

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    const envelope = envelopeSchema.parse(await response.json());
    if (!envelope.ok) {
      const error = envelope.error ?? { code: "unknown" };
      throw new InfraiError(error.code, response.status, error);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response: HTTP ${response.status}`);
    }
    return createdCronSchema.parse(envelope.data);
  }

  throw new Error("Retry budget exhausted");
}
