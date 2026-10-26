import { Cron } from "croner";
import { ingestAll } from "./ingest";

const schedule = process.env["INGEST_CRON"] ?? "0 5 * * *";

const job = new Cron(schedule, { timezone: "America/Bogota", protect: true }, async () => {
  console.log(`[worker] snapshot started ${new Date().toISOString()}`);
  await ingestAll();
});

console.log(`[worker] scheduled "${schedule}" (America/Bogota), next run ${job.nextRun()?.toISOString()}`);

if (process.env["INGEST_ON_START"] === "1") void job.trigger();

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    job.stop();
    process.exit(0);
  });
