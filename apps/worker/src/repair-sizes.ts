// One-off repair: products first recorded before the size parser understood "1.000 G" (thousands)
// or rejected placeholders like "(1 gr)" kept the wrong size, since recordOffer never updates it.
// Re-reads the names of every small g / ml product; a size none of them states becomes unknown.
import { parsePackageSize, plausibleSize } from "@rinde/core";
import { db } from "@rinde/db";

export async function repairSizes() {
  const prisma = db();
  const suspects = await prisma.product.findMany({
    where: { unit: { in: ["g", "ml"] }, size: { lt: 10 } },
    select: { id: true, name: true, size: true, unit: true, listings: { select: { name: true } } },
  });
  const changes = [];
  for (const p of suspects) {
    const current = { amount: Number(p.size), unit: p.unit! };
    const parsed = [p.name, ...p.listings.map((l) => l.name)].map(parsePackageSize).find(Boolean) ?? null;
    const next = parsed ?? (plausibleSize(current) ? current : null);
    if (next?.amount === current.amount && next.unit === current.unit) continue;
    await prisma.product.update({ where: { id: p.id }, data: { size: next?.amount ?? null, unit: next?.unit ?? null } });
    changes.push({ name: p.name, from: `${current.amount} ${current.unit}`, to: next ? `${next.amount} ${next.unit}` : "unknown" });
  }
  return changes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.table(await repairSizes());
  process.exit(0);
}
