const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(outputText, filename);
};
const { googleMapsUrl, wazeUrl } = require("../lib/navigate.ts");

const D1 = { lat: 4.6486, lon: -74.0628 };
const CARULLA = { lat: 4.6512, lon: -74.0601 };
const HOME = { lat: 4.647, lon: -74.064 };

test("Google Maps goes through every stop in order, ending at the last", () => {
  const url = new URL(googleMapsUrl([D1, CARULLA], "walk", HOME));
  assert.equal(url.origin + url.pathname, "https://www.google.com/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), "4.647,-74.064");
  assert.equal(url.searchParams.get("destination"), "4.6512,-74.0601");
  assert.equal(url.searchParams.get("waypoints"), "4.6486,-74.0628");
  assert.equal(url.searchParams.get("travelmode"), "walking");
});
test("without a shared location Google starts from the phone, and one stop has no waypoints", () => {
  const url = new URL(googleMapsUrl([D1], "car"));
  assert.equal(url.searchParams.get("origin"), null);
  assert.equal(url.searchParams.get("waypoints"), null);
  assert.equal(url.searchParams.get("travelmode"), "driving");
});
test("each travel mode maps to Google's", () => {
  const mode = m => new URL(googleMapsUrl([D1], m)).searchParams.get("travelmode");
  assert.deepEqual(["walk", "bus", "moto", "car"].map(mode), ["walking", "transit", "two-wheeler", "driving"]);
});
test("a route needs a stop", () => {
  assert.throws(() => googleMapsUrl([], "walk"));
});
test("Waze navigates to one stop", () => {
  const url = new URL(wazeUrl(CARULLA));
  assert.equal(url.host, "waze.com");
  assert.equal(url.searchParams.get("ll"), "4.6512,-74.0601");
  assert.equal(url.searchParams.get("navigate"), "yes");
});
