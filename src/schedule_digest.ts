import { z } from "zod";
import { createDigestCron, InfraiError } from "./infrai_cron";

const environmentSchema = z.object({
  DIGEST_WEBHOOK_URL: z.string().url()
});

async function main(): Promise<void> {
  const { DIGEST_WEBHOOK_URL } = environmentSchema.parse(process.env);
  const result = await createDigestCron({
    cron_expr: "0 9 * * 1",
    task: DIGEST_WEBHOOK_URL
  });
  console.log(JSON.stringify({ event: "digest_cron_created", job_id: result.job_id }));
}

main().catch((error: unknown) => {
  if (error instanceof InfraiError) {
    const clientStatus = error.status >= 400 && error.status < 500 ? error.status : 502;
    console.error(JSON.stringify({ event: "schedule_rejected", status: clientStatus }));
  } else {
    console.error(JSON.stringify({ event: "schedule_failed" }));
  }
  process.exitCode = 1;
});
