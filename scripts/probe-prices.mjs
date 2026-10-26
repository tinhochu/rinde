// Feasibility probe: query each retailer's public VTEX catalog search for a demo basket
// and report coverage, price fields, EANs and package sizes.
// Usage: node scripts/probe-prices.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";

const RETAILERS = {
  exito: "https://www.exito.com/io/api/catalog_system/pub/products/search",
  jumbo: "https://www.jumbocolombia.com/api/catalog_system/pub/products/search",
  d1: "https://www.d1.com.co/api/catalog_system/pub/products/search",
};

const BASKET = [
  "arroz 1 kg", "aceite girasol", "leche entera", "huevos", "azucar",
  "cafe molido", "pasta spaghetti", "frijol", "lenteja", "atun lata",
  "papel higienico", "jabon detergente polvo", "chocolate pastilla", "panela", "harina pan",
];

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

async function search(base, term) {
  const url = `${base}?ft=${encodeURIComponent(term)}&_from=0&_to=9`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Rinde feasibility probe)" } });
  if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function flatten(products) {
  return products.flatMap((p) =>
    p.items.map((it) => {
      const offer = it.sellers?.[0]?.commertialOffer ?? {};
      return {
        name: p.productName,
        brand: p.brand,
        ean: it.ean || null,
        unit: it.measurementUnit,
        unitMultiplier: it.unitMultiplier,
        price: offer.Price,
        listPrice: offer.ListPrice,
        available: offer.IsAvailable,
        seller: it.sellers?.[0]?.sellerName,
      };
    }),
  );
}

const report = {};
const raw = {};
for (const [retailer, base] of Object.entries(RETAILERS)) {
  report[retailer] = {};
  raw[retailer] = {};
  for (const term of BASKET) {
    try {
      const items = flatten(await search(base, term));
      raw[retailer][term] = items;
      const priced = items.filter((i) => i.available && i.price > 0);
      report[retailer][term] = {
        hits: items.length,
        priced: priced.length,
        withEan: items.filter((i) => i.ean).length,
        cheapest: priced.sort((a, b) => a.price - b.price)[0] ?? null,
      };
    } catch (e) {
      report[retailer][term] = { error: String(e.message) };
    }
    await new Promise((r) => setTimeout(r, 300)); // be polite
  }
}

const observedAt = new Date().toISOString();
writeFileSync(`${outDir}/probe-raw.json`, JSON.stringify({ observedAt, raw }, null, 2));

// Summary table
console.log(`observedAt ${observedAt}\n`);
for (const [retailer, terms] of Object.entries(report)) {
  const vals = Object.values(terms);
  const covered = vals.filter((v) => v.priced > 0).length;
  console.log(`## ${retailer}: ${covered}/${BASKET.length} terms with an available priced item`);
  for (const [term, v] of Object.entries(terms)) {
    if (v.error) { console.log(`  ${term.padEnd(24)} ERROR ${v.error}`); continue; }
    const c = v.cheapest;
    console.log(`  ${term.padEnd(24)} hits=${String(v.hits).padStart(2)} priced=${String(v.priced).padStart(2)} ean=${String(v.withEan).padStart(2)}  ${c ? `$${c.price} ${c.name} [${c.ean ?? "no-ean"}]` : "-"}`);
  }
  console.log();
}

// EAN overlap across retailers (same product at multiple chains)
const eans = Object.fromEntries(Object.entries(raw).map(([r, t]) => [r, new Set(Object.values(t).flat().map((i) => i.ean).filter(Boolean))]));
const names = Object.keys(eans);
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++) {
    const shared = [...eans[names[i]]].filter((e) => eans[names[j]].has(e));
    console.log(`EAN overlap ${names[i]}∩${names[j]}: ${shared.length}`);
  }
