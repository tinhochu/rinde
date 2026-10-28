// One-off repair: products first recorded before the size parser understood "1.000 G" (thousands)
// or rejected placeholders like "(1 gr)" kept the wrong size, since recordOffer never updates it.
// Re-reads the names of every small g / ml product; a size none of them states becomes unknown.
// Also re-reads names like "Arroz Roa 10 x2.5kg", once read as ten 2.5 kg bags.
import { parsePackageSize, plausibleSize } from "@rinde/core";
import { db } from "@rinde/db";

const N_X_SIZE = /\d\s+x\d/i;

export async function repairSizes() {
  const prisma = db();
  const suspects = await prisma.product.findMany({
    where: {
      OR: [
        { unit: { in: ["g", "ml"] }, size: { lt: 10 } },
        { name: { contains: " x", mode: "insensitive" }, size: { not: null } },
      ],
    },
    select: { id: true, name: true, size: true, unit: true, listings: { select: { name: true } } },
  });
  const changes = [];
  for (const p of suspects) {
    const current = { amount: Number(p.size), unit: p.unit! };
    const parsed = [p.name, ...p.listings.map((l) => l.name)].map(parsePackageSize).find(Boolean) ?? null;
    // A bigger size is only re-read for the "10 x2.5kg" shape the parser used to misread; any other
    // size may come from store metadata (Jumbo's net content of "1L x6unds"), which knows better.
    if (current.amount >= 10 && !(N_X_SIZE.test(p.name) && parsed && parsed.unit === current.unit)) continue;
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
