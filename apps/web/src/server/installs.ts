import "server-only";
import { z } from "zod";
import { db } from "@rinde/db";

const WAYS = ["prompt", "ios", "android", "inapp", "none"] as const;

/** One event from the PWA. Only these exact values are counted; nothing about the device is kept. */
export const installEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("launch"), detail: z.enum(["app", "browser"]), way: z.enum(WAYS) }),
  z.object({ event: z.literal("installed"), detail: z.enum(["prompt", "menu"]), way: z.enum(WAYS) }),
  z.object({ event: z.literal("guide"), detail: z.enum(["shown", "snoozed", "install-tap", "copy-link"]), way: z.enum(WAYS) }),
]);
export type InstallEvent = z.infer<typeof installEventSchema>;

/** Adds one to today's counter (Bogotá's day) for this event. */
export async function countInstallEvent(e: InstallEvent, now = new Date()) {
  const day = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  await db().$executeRaw`
    INSERT INTO "InstallCount" (day, event, detail, way, count) VALUES (${day}::date, ${e.event}, ${e.detail}, ${e.way}, 1)
    ON CONFLICT (day, event, detail, way) DO UPDATE SET count = "InstallCount".count + 1`;
}

export type InstallStats = {
  days: number;
  totals: { launchesFromApp: number; launchesInBrowser: number; installed: number; guideShown: number; guideSnoozed: number; installTaps: number };
  rows: { day: string; event: string; detail: string; way: string; count: number }[];
};

/** The last `days` days of counters, with totals: how many daily launches came from the icon vs a browser, and how the guide did. */
export async function installStats(days = 14): Promise<InstallStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = (await db().installCount.findMany({ where: { day: { gte: since } }, orderBy: [{ day: "desc" }, { event: "asc" }, { detail: "asc" }] }))
    .map((r) => ({ day: r.day.toISOString().slice(0, 10), event: r.event, detail: r.detail, way: r.way, count: r.count }));
  const sum = (event: string, detail?: string) => rows.filter((r) => r.event === event && (!detail || r.detail === detail)).reduce((n, r) => n + r.count, 0);
  return {
    days,
    totals: {
      launchesFromApp: sum("launch", "app"), launchesInBrowser: sum("launch", "browser"), installed: sum("installed"),
      guideShown: sum("guide", "shown"), guideSnoozed: sum("guide", "snoozed"), installTaps: sum("guide", "install-tap"),
    },
    rows,
  };
}
