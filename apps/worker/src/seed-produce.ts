// Seeds canonical produce items (packages/core PRODUCE). Idempotent: upserts by slug.
import { PRODUCE } from "@rinde/core";
import { db } from "@rinde/db";

export async function seedProduce() {
  const prisma = db();
  for (const p of PRODUCE) {
    const data = { name: p.name, aliases: p.aliases, defaultUnit: p.defaultUnit };
    await prisma.produceItem.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...data }, update: data });
  }
  return PRODUCE.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedProduce()
    .then((n) => console.log(`[seed] ${n} produce items`))
    .finally(() => db().$disconnect());
}
