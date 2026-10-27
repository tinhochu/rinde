import { Cron } from "croner";
import { cleanupReceipts } from "./cleanup";
import { ingestAll } from "./ingest";

const schedule = process.env["INGEST_CRON"] ?? "0 5 * * *";

const job = new Cron(schedule, { timezone: "America/Bogota", protect: true }, async () => {
  console.log(`[worker] snapshot started ${new Date().toISOString()}`);
  await ingestAll();
});

console.log(`[worker] scheduled "${schedule}" (America/Bogota), next run ${job.nextRun()?.toISOString()}`);

// Receipt retention: hourly, so a 24 h-old draft never lingers long.
new Cron("17 * * * *", { timezone: "America/Bogota", protect: true }, async () => {
  const removed = await cleanupReceipts();
  if (removed.drafts || removed.images) console.log(`[worker] receipts cleanup: ${removed.drafts} drafts, ${removed.images} photos`);
});

if (process.env["INGEST_ON_START"] === "1") void job.trigger();

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    job.stop();
    process.exit(0);
  });
