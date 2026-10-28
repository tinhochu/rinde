import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
// The built site (pnpm build): the pages are prerendered there.
const dist = (path) => new URL(`dist/${path}`, root);
assert.ok(existsSync(dist("index.html")), "run `pnpm build` before the tests");
const es = readFileSync(dist("index.html"), "utf8");
const en = readFileSync(dist("en/index.html"), "utf8");

const sectionIds = (html) => [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
const meta = (html, attr, name) => new RegExp(`<meta ${attr}="${name}" content="[^"]+"`).test(html);

test("both languages have the same sections", () => {
  assert.ok(sectionIds(es).length >= 4);
  assert.deepEqual(sectionIds(en), sectionIds(es));
});

test("each page declares its language, its alternate and its link preview", () => {
  for (const [html, lang] of [[es, "es"], [en, "en"]]) {
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(html, /<link rel="alternate" hreflang="es" href="[^"]+\/" \/>/);
    assert.match(html, /<link rel="alternate" hreflang="en" href="[^"]+\/en\/" \/>/);
    for (const name of ["og:title", "og:description", "og:image", "og:url"]) assert.ok(meta(html, "property", name), `${lang} ${name}`);
    for (const name of ["description", "twitter:card", "twitter:title", "twitter:image", "rinde-app", "rinde-api"]) assert.ok(meta(html, "name", name), `${lang} ${name}`);
  }
  assert.match(es, /og-es\.png/);
  assert.match(en, /og-en\.png/);
});

test("the page text is in the HTML, not added by a script", () => {
  assert.match(es, /El mismo mercado\./);
  assert.match(en, /Same groceries\./);
  assert.match(es, /<details/);
});

test("both pages open the app in the same tab and switch language", () => {
  for (const html of [es, en]) {
    const links = [...html.matchAll(/<a [^>]*data-open-app[^>]*>/g)].map((m) => m[0]);
    assert.ok(links.length >= 3);
    for (const link of links) assert.doesNotMatch(link, /target=/);
    assert.match(html, /<a [^>]*hrefLang="(es|en)"|<a [^>]*hreflang="(es|en)"/i);
  }
  assert.match(es, /id="read-en" hidden/);
});

test("no price is written into the pages", () => {
  for (const path of ["index.html", "en/index.html", "404.html"]) {
    assert.doesNotMatch(readFileSync(dist(path), "utf8"), /\$\s?\d/, path);
  }
});

test("the first view transfers under 200 KB", () => {
  // Text is served gzipped; fonts and photos as they are. The lazy-loaded photo is not in the first view.
  const css = [...es.matchAll(/href="\/(static\/[^"]+\.css)"/g)].map((m) => m[1]);
  const js = [...es.matchAll(/src="\/(static\/[^"]+\.js)"/g)].map((m) => m[1]);
  const fonts = css.flatMap((f) => [...readFileSync(dist(f), "utf8").matchAll(/url\(\/(static\/[^)]+\.woff2)\)/g)].map((m) => m[1]));
  const hero = [...es.matchAll(/src="\/(static\/[^"]+\.webp)" [^>]*fetchPriority="high"/gi)].map((m) => m[1]);
  assert.equal(hero.length, 1);
  const gz = (path) => gzipSync(readFileSync(dist(path))).length;
  const bytes = gz("index.html") + gz("handoff.js") + [...css, ...js].reduce((n, f) => n + gz(f), 0)
    + [...fonts, ...hero].reduce((n, f) => n + statSync(dist(f)).size, 0);
  assert.ok(bytes < 200 * 1024, `${bytes} bytes`);
});

// The handoff script, run as the browser would but without a document.
function loadHandoff() {
  const context = { TextEncoder, btoa };
  runInNewContext(read("public/handoff.js"), context);
  return context.rindeHandoff;
}

function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

const decode = (packed) => JSON.parse(Buffer.from(packed, "base64url").toString("utf8"));

test("handoff carries the app's keys only, once", () => {
  const h = loadHandoff();
  const s = storage({ "rinde-session": "abc", "rinde-cart": "[]", "rinde-theme": "dark", other: "x" });
  const url = h.handoffUrl("https://app.example", s, 1000);
  const [, packed] = url.split("#rinde-handoff=");
  assert.deepEqual(decode(packed), { "rinde-session": "abc", "rinde-cart": "[]", "rinde-theme": "dark" });
  assert.equal(s.getItem("rinde-handoff-done"), "1000");
  assert.equal(h.handoffUrl("https://app.example", s, 2000), "https://app.example/");
});

test("handoff with no old data just opens the app", () => {
  const h = loadHandoff();
  const s = storage();
  assert.equal(h.handoffUrl("https://app.example", s, 1), "https://app.example/");
  assert.equal(s.getItem("rinde-handoff-done"), null);
});

test("handoff drops searches first when the data is too big", () => {
  const h = loadHandoff();
  const big = "x".repeat(h.MAX);
  const packed = h.pack({ "rinde-session": "abc", "rinde-cart": "[1]", "rinde-searches": big, "rinde-picks": "p" });
  assert.deepEqual(decode(packed), { "rinde-session": "abc", "rinde-cart": "[1]", "rinde-picks": "p" });
  assert.equal(h.pack({ "rinde-session": "x".repeat(h.MAX) }), null);
});

test("handoff keeps non-ASCII text intact", () => {
  const h = loadHandoff();
  assert.deepEqual(decode(h.encode({ "rinde-favorites": "Café Águila Roja ñ" })), { "rinde-favorites": "Café Águila Roja ñ" });
});

test("the old copy is removed 30 days after the handoff", () => {
  const h = loadHandoff();
  const day = 24 * 3600 * 1000;
  const s = storage({ "rinde-session": "abc", "rinde-handoff-done": "0" });
  h.expire(s, 29 * day);
  assert.equal(s.getItem("rinde-session"), "abc");
  h.expire(s, 31 * day);
  assert.equal(s.getItem("rinde-session"), null);
  assert.equal(s.getItem("rinde-handoff-done"), "0");
});
