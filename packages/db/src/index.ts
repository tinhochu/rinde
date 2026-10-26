import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";
export * from "./record";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrisma(connectionString = process.env["DATABASE_URL"]) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= createPrisma();
  return globalForPrisma.prisma;
}
