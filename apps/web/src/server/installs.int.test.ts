import { afterAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import { countInstallEvent, installEventSchema, installStats } from "./installs";

// A day far in the past so real counters are never touched.
const AT = new Date("2001-02-03T18:00:00Z");

describe.skipIf(!process.env["INTEGRATION"])("install counters (dev DB)", () => {
  afterAll(async () => {
    await db().installCount.deleteMany({ where: { day: new Date("2001-02-03") } });
  });

  it("adds one per event to that day's counter, and keeps nothing else", async () => {
    await countInstallEvent({ event: "launch", detail: "browser", way: "ios" }, AT);
    await countInstallEvent({ event: "launch", detail: "browser", way: "ios" }, AT);
    await countInstallEvent({ event: "installed", detail: "prompt", way: "prompt" }, AT);
    const rows = await db().installCount.findMany({ where: { day: new Date("2001-02-03") }, orderBy: { event: "asc" } });
    expect(rows.map((r) => [r.event, r.detail, r.way, r.count])).toEqual([
      ["installed", "prompt", "prompt", 1],
      ["launch", "browser", "ios", 2],
    ]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["count", "day", "detail", "event", "way"]);
  });

  it("refuses anything but the known events", () => {
    expect(installEventSchema.safeParse({ event: "launch", detail: "app", way: "ios" }).success).toBe(true);
    expect(installEventSchema.safeParse({ event: "launch", detail: "x".repeat(500), way: "ios" }).success).toBe(false);
    expect(installEventSchema.safeParse({ event: "installed", detail: "shown", way: "ios" }).success).toBe(false);
    expect(installEventSchema.safeParse({ event: "launch", detail: "app", way: "ios", device: "abc" }).data).not.toHaveProperty("device");
  });

  it("sums the totals", async () => {
    const stats = await installStats(36500);
    expect(stats.totals.launchesInBrowser).toBeGreaterThanOrEqual(2);
    expect(stats.totals.installed).toBeGreaterThanOrEqual(1);
  });
});
