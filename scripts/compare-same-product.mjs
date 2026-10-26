// Compare the exact same product (by EAN) across Éxito, Jumbo and D1.
// D1 is mostly private label, so seed EANs from name-brand items D1 carries,
// then look each EAN up at the other chains.
// Usage: node scripts/compare-same-product.mjs
const BASES = {
  d1: "https://www.d1.com.co/api/catalog_system/pub/products/search",
  jumbo: "https://www.jumbocolombia.com/api/catalog_system/pub/products/search",
  exito: "https://www.exito.com/io/api/catalog_system/pub/products/search",
};
const D1_PRIVATE_LABEL_PREFIX = "7700304";
const BRAND_TERMS = [
  "colanta", "alpina", "zenu", "nescafe", "sello rojo", "aguila", "coca cola", "postobon",
  "fab", "familia", "colgate", "ramo", "harina pan", "doria", "quaker", "maggi",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(base, qs) {
  const res = await fetch(`${base}?${qs}`, { headers: { "User-Agent": "Mozilla/5.0 (Rinde price comparison)" } });
  if (!res.ok && res.status !== 206) return [];
  return res.json().catch(() => []);
}

function offers(products) {
  return products.flatMap((p) =>
    p.items.map((it) => ({
      name: p.productName,
      ean: it.ean,
      price: it.sellers?.[0]?.commertialOffer?.Price,
      available: it.sellers?.[0]?.commertialOffer?.IsAvailable,
    })),
  );
}

// 1. Seed: name-brand EANs sold at D1
const seeds = new Map();
for (const term of BRAND_TERMS) {
  for (const o of offers(await get(BASES.d1, `ft=${encodeURIComponent(term)}&_from=0&_to=9`)))
    if (o.ean && !o.ean.startsWith(D1_PRIVATE_LABEL_PREFIX) && o.available && o.price > 0) seeds.set(o.ean, o);
  await sleep(300);
}

// 2. Look up each EAN at Jumbo and Éxito
const rows = [];
for (const [ean, d1] of seeds) {
  const row = { ean, name: d1.name, d1: d1.price };
  for (const r of ["jumbo", "exito"]) {
    const hit = offers(await get(BASES[r], `fq=alternateIds_Ean:${ean}`)).find((o) => o.ean === ean && o.available);
    row[r] = hit?.price ?? null;
    await sleep(300);
  }
  rows.push(row);
}

// 3. Report
const fmt = (n) => (n == null ? "—".padStart(9) : `$${n.toLocaleString("es-CO")}`.padStart(9));
const matched = rows.filter((r) => [r.d1, r.jumbo, r.exito].filter((x) => x != null).length >= 2);
console.log(`observedAt ${new Date().toISOString()}  seeds=${seeds.size}  in ≥2 chains=${matched.length}  in all 3=${rows.filter((r) => r.jumbo != null && r.exito != null).length}\n`);
console.log(`${"product".padEnd(46)} ${"D1".padStart(9)} ${"Jumbo".padStart(9)} ${"Éxito".padStart(9)}  spread`);
for (const r of matched.sort((a, b) => b.name.localeCompare(a.name) * -1)) {
  const ps = [r.d1, r.jumbo, r.exito].filter((x) => x != null);
  const spread = Math.round(((Math.max(...ps) - Math.min(...ps)) / Math.min(...ps)) * 100);
  console.log(`${r.name.slice(0, 46).padEnd(46)} ${fmt(r.d1)} ${fmt(r.jumbo)} ${fmt(r.exito)}  ${String(spread).padStart(3)}%`);
}
