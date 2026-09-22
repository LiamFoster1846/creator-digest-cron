import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const digestRequestSchema = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  subscribers: z.array(
    z.object({
      email: z.string().email(),
      updatesEnabled: z.boolean()
    })
  ),
  assets: z.array(
    z.object({
      title: z.string().min(1),
      deliveryUrl: z.string().url(),
      deliveryReady: z.boolean(),
      processingState: z.enum(["pending", "processed", "rejected"])
    })
  )
});

export type DigestRequest = z.infer<typeof digestRequestSchema>;

export type DigestPlan = {
  week: string;
  recipients: string[];
  deliveries: Array<{ title: string; deliveryUrl: string }>;
  decision: "send" | "skip";
};

export function planDigest(input: DigestRequest): DigestPlan {
  const recipients = input.subscribers
    .filter((subscriber) => subscriber.updatesEnabled)
    .map((subscriber) => subscriber.email);
  const deliveries = input.assets
    .filter(
      (asset) => asset.deliveryReady && asset.processingState === "processed"
    )
    .map(({ title, deliveryUrl }) => ({ title, deliveryUrl }));

  return {
    week: input.week,
    recipients,
    deliveries,
    decision: recipients.length > 0 && deliveries.length > 0 ? "send" : "skip"
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handleDigest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== "POST" || request.url !== "/jobs/weekly-digest") {
    response.writeHead(404).end();
    return;
  }

  try {
    const input = digestRequestSchema.parse(await readJson(request));
    const plan = planDigest(input);
    console.log(JSON.stringify({ event: "digest_planned", ...plan }));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(plan));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_digest_request" }));
      return;
    }
    throw error;
  }
}

const isEntrypoint = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? "3000");
  createServer((request, response) => {
    void handleDigest(request, response).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "digest_request_failed", error }));
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  }).listen(port, () => {
    console.log(JSON.stringify({ event: "digest_worker_listening", port }));
  });
}
