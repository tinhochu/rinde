import { db } from "@rinde/db";

// Coolify health check: the app is up and can reach Postgres.
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
