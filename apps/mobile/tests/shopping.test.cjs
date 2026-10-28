const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Load the actual pure TypeScript modules, without a second test framework.
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(outputText, filename);
};
// shop.ts colors its categories from lib/theme.ts, which reads the color scheme through react-native
// and expo-sqlite; Node can load neither, and these tests don't look at colors.
const Module = require("node:module");
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "./theme" && parent?.filename.endsWith("/lib/shop.ts")) return { tints: new Proxy({}, { get: () => "#FFFFFF" }) };
  return load.call(this, request, parent, ...rest);
};
const { choices, optimize, parseList, quantityLabel } = require("../lib/market.ts");
const { IDEAS, cartSchema, favoritesSchema, draftSchema, fromOffer, toListItems, isFresh, observedLabel } = require("../lib/shop.ts");

function offer(overrides = {}) {
  return { id: "Éxito-1", store: "Éxito", name: "Arroz blanco Marca A 1000 g", brand: "Marca A", ean: "7700000000001", price: 6000, stock: 20, pack: 1000, unit: "g", image: "https://example.com/product.jpg", url: "https://example.com/product/p", observedAt: "2026-05-01T12:00:00.000Z", channel: "Tienda online", ...overrides };
}
function item(overrides = {}) {
  return { id: "rice", name: "arroz blanco", quantity: 2000, unit: "g", brand: "", allowSubstitution: true, ...overrides };
}
function result(rows) { return { rows, area: "Medellín", checkedAt: "2026-05-01T12:00:00.000Z" }; }

test("editorial ideas never contain invented prices or retailer availability", () => {
  assert.ok(IDEAS.length >= 6);
  for (const product of IDEAS) { assert.equal(product.offer, undefined); assert.equal(product.brand, ""); assert.ok(product.pack > 0); }
});
test("basket quantities become exact base-unit quantities for the planner", () => {
  const lines = toListItems([{ product: IDEAS.find(p => p.id === "idea-rice"), count: 3 }, { product: IDEAS.find(p => p.id === "idea-eggs"), count: 2 }]);
  assert.equal(lines[0].quantity, 3000); assert.equal(lines[0].unit, "g");
  assert.equal(lines[1].quantity, 60); assert.equal(lines[1].unit, "und");
  assert.equal(lines[0].allowSubstitution, true);
});
test("live products keep source, exact pack size and search term", () => {
  const source = offer(); const product = fromOffer(source, "arroz blanco", "pantry");
  assert.equal(product.offer, source); assert.equal(product.term, "arroz blanco");
  assert.equal(product.pack, source.pack); assert.equal(product.id, source.id);
});
test("local basket persistence deliberately strips observed offers", () => {
  const parsed = cartSchema.parse([{ product: fromOffer(offer(), "arroz blanco", "pantry"), count: 2 }]);
  assert.equal(parsed[0].product.offer, undefined); assert.equal(parsed[0].count, 2);
  assert.equal(favoritesSchema.parse([fromOffer(offer(), "arroz blanco", "pantry")])[0].offer, undefined);
});
test("invalid local quantities and oversized baskets are rejected", () => {
  assert.equal(cartSchema.safeParse([{ product: IDEAS[0], count: 0 }]).success, false);
  assert.equal(cartSchema.safeParse([{ product: IDEAS[0], count: 1.5 }]).success, false);
  assert.equal(cartSchema.safeParse(Array.from({ length: 21 }, () => ({ product: IDEAS[0], count: 1 }))).success, false);
});
test("five-minute-old prices are not counted as fresh", () => {
  const source = offer(); const time = new Date(source.observedAt).getTime();
  assert.equal(isFresh(source, time + 299999), true);
  assert.equal(isFresh(source, time + 300000), false);
  assert.equal(isFresh(undefined, time), false);
  assert.equal(observedLabel(source, time + 300000), "Hace 5 min");
  assert.equal(observedLabel(source, time + 30000), "Verificado ahora");
});
test("pack rounding and stock limits are honored deterministically", () => {
  const row = { item: item({ quantity: 2500 }), offers: [offer()], reasons: [] };
  assert.equal(choices(row)[0].packs, 3); assert.equal(choices(row)[0].total, 18000);
  assert.equal(choices({ ...row, offers: [offer({ stock: 2 })] }).length, 0);
});
test("split and single-store totals produce an auditable savings difference", () => {
  const rows = [
    { item: item(), offers: [offer(), offer({ id: "Jumbo-1", store: "Jumbo", price: 5000 })], reasons: [] },
    { item: item({ id: "milk", name: "leche", quantity: 1000, unit: "ml" }), offers: [offer({ id: "Éxito-2", name: "Leche", pack: 1000, unit: "ml", price: 4000 }), offer({ id: "Jumbo-2", store: "Jumbo", name: "Leche", pack: 1000, unit: "ml", price: 6000 })], reasons: [] },
  ];
  const plan = optimize(result(rows));
  assert.equal(plan.split.total, 14000); assert.equal(plan.split.stops, 2);
  assert.equal(plan.single.total, 16000); assert.equal(plan.savings, 2000);
  assert.equal(plan.single.total - plan.split.total, plan.savings);
});
test("missing offers produce a partial basket, never a fabricated savings claim", () => {
  const plan = optimize(result([{ item: item(), offers: [offer()], reasons: [] }, { item: item({ id: "missing", name: "lentejas" }), offers: [], reasons: ["D1: catálogo no disponible"] }]));
  assert.equal(plan.split.complete, false); assert.equal(plan.single, undefined);
  assert.equal(plan.savings, null); assert.equal(plan.unavailable.length, 1);
  assert.equal(plan.split.total, 12000);
});
test("a rejected brand substitution cannot re-enter the basket", () => {
  const row = { item: item({ brand: "Marca A", allowSubstitution: false }), offers: [offer(), offer({ id: "D1-1", store: "D1", brand: "Marca B", price: 4000 })], reasons: [] };
  assert.equal(choices(row).length, 1); assert.equal(choices(row)[0].offer.brand, "Marca A");
});
test("permitted substitutions require matching packs and an observed original brand", () => {
  const row = { item: item({ brand: "Marca A" }), offers: [offer(), offer({ id: "D1-1", store: "D1", brand: "Marca B", price: 4000 }), offer({ id: "D1-2", store: "D1", brand: "Marca C", price: 1000, pack: 500 })], reasons: [] };
  const selected = choices(row)[0];
  assert.equal(selected.offer.brand, "Marca B"); assert.equal(selected.substitution, true);
  assert.equal(selected.alternative.total - selected.total, 4000);
  assert.equal(choices({ ...row, offers: row.offers.slice(1) }).length, 0);
});
test("Spanish list parsing and quantity labels preserve grocery units", () => {
  const parsed = parseList("2 kg de arroz\n1 litro de leche\n30 huevos");
  assert.equal(parsed[0].quantity, 2000); assert.equal(parsed[0].name, "arroz");
  assert.equal(parsed[1].quantity, 1000); assert.equal(parsed[1].unit, "ml");
  assert.equal(parsed[2].quantity, 30); assert.equal(parsed[2].unit, "und");
  assert.equal(quantityLabel(2000, "g"), "2 kg"); assert.equal(quantityLabel(1000, "ml"), "1 L");
});
test("saved drafts reject invalid budgets and units", () => {
  assert.equal(draftSchema.safeParse({ budget: 0, people: 4, zone: "Medellín", items: [] }).success, false);
  assert.equal(draftSchema.safeParse({ budget: 200000, people: 4, zone: "Laureles", items: [item()] }).success, true);
});
