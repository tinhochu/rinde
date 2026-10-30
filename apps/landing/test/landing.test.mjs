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

// --- what agents read ----------------------------------------------------------------------------

const SLUGS = ["about", "contact", "privacy"];
const htmlPages = ["index.html", "en/index.html", ...SLUGS.flatMap((s) => [`${s}/index.html`, `en/${s}/index.html`])];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const mainText = (html) => text(html.match(/<main[\s\S]*<\/main>/)?.[0] ?? "");

test("the homepage title names the product, the link preview keeps the tagline", () => {
  assert.match(es, /<title>Rinde: comparador de precios de supermercado en Colombia<\/title>/);
  assert.match(en, /<title>Rinde: grocery price comparison for Colombian supermarkets<\/title>/);
  assert.match(es, /<meta property="og:title" content="Rinde: el mismo mercado, más plata en tu bolsillo"/);
});

test("the homepage carries Organization, WebSite and WebApplication JSON-LD", () => {
  for (const html of [es, en]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.equal(blocks.length, 1);
    const graph = blocks[0]["@graph"];
    assert.equal(blocks[0]["@context"], "https://schema.org");
    const byType = Object.fromEntries(graph.map((n) => [n["@type"], n]));
    assert.deepEqual(Object.keys(byType).sort(), ["Organization", "WebApplication", "WebSite"]);
    const org = byType.Organization;
    assert.equal(org.name, "Rinde");
    assert.match(org.contactPoint.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
    assert.ok(org.contactPoint.contactType);
    assert.deepEqual(org.sameAs, ["https://github.com/tinhochu/rinde"]);
    assert.equal(org.address["@type"], "PostalAddress");
    for (const field of ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"]) assert.ok(org.address[field], field);
    const app = byType.WebApplication;
    assert.ok(app.name && app.description && app.url && app.applicationCategory);
    assert.equal(app.offers.price, "0");
  }
});

test("About, Contact and Privacy exist in both languages, with real text, linked from the home footer", () => {
  for (const lang of ["", "en/"]) {
    for (const slug of SLUGS) {
      const html = readFileSync(dist(`${lang}${slug}/index.html`), "utf8");
      assert.ok(mainText(html).length >= 500, `${lang}${slug}: ${mainText(html).length} characters`);
      assert.match(html, /<h1>/);
      assert.match(html, new RegExp(`<link rel="canonical" href="[^"]+/${lang}${slug}/" />`));
      assert.match(lang ? en : es, new RegExp(`href="/${lang}${slug}/"`));
    }
  }
  assert.match(mainText(readFileSync(dist("contact/index.html"), "utf8")), /\S+@\S+\.\w+/);
  assert.match(mainText(readFileSync(dist("en/contact/index.html"), "utf8")), /Leander, TX 78641/);
});

test("every page has a Markdown twin with the same content", () => {
  for (const page of htmlPages) {
    const md = readFileSync(dist(page.replace(/\.html$/, ".md")), "utf8");
    assert.match(md, /^# \S/, page);
    assert.ok(md.length > 300, page);
    assert.doesNotMatch(md, /<[a-z][^>]*>/i, `${page}: HTML in the Markdown`);
    const html = readFileSync(dist(page), "utf8");
    assert.match(html, new RegExp(`<link rel="alternate" type="text/markdown" href="[^"]+/${page.replace(/index\.html$/, "")}index\\.md" />`));
    // The first heading of the HTML's main content is in the Markdown too.
    const h1 = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
    assert.ok(h1 && md.replace(/\s+/g, " ").includes(h1), `${page}: ${h1}`);
  }
  const home = readFileSync(dist("index.md"), "utf8");
  assert.match(home, /El mismo mercado\./);
  assert.match(home, /\]\(https:\/\/[^)]+\/llms\.txt\)/);
});

test("the Markdown 404 explains itself and links somewhere useful", () => {
  const md = readFileSync(dist("404.md"), "utf8");
  assert.ok(md.length >= 20);
  assert.match(md, /404/);
  assert.match(md, /\/llms\.txt\)/);
  assert.match(md, /\/sitemap\.xml\)/);
});

test("llms.txt follows llmstxt.org and says when to use Rinde", () => {
  const llms = readFileSync(dist("llms.txt"), "utf8");
  const lines = llms.split("\n");
  assert.equal(lines[0], "# Rinde");
  assert.match(llms, /^> \S/m);
  assert.equal(llms.match(/^# /gm).length, 1);
  assert.match(llms, /^When to use Rinde:$/m);
  assert.match(llms, /^When not to use it:/m);
  assert.match(llms, /GET https:\/\/\S+\/api\/catalog\?query=/);
  // Each H2 section is a list of links, each to a file the build wrote.
  const sections = llms.split(/^## /m).slice(1);
  assert.deepEqual(sections.map((s) => s.split("\n")[0]), ["Pages", "Optional"]);
  for (const section of sections) {
    for (const line of section.split("\n").slice(1).filter(Boolean)) {
      const m = line.match(/^- \[[^\]]+\]\(https:\/\/[^/]+\/([^)]*)\)(: .+)?$/);
      assert.ok(m, line);
      assert.ok(existsSync(dist(m[1])), m[1]);
    }
  }
});

test("the sitemap lists every page, both languages, with a lastmod", () => {
  const xml = readFileSync(dist("sitemap.xml"), "utf8");
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  const locs = [...xml.matchAll(/<loc>https:\/\/[^/]+\/([^<]*)<\/loc>/g)].map((m) => `${m[1]}index.html`);
  assert.deepEqual(locs.sort(), [...htmlPages].sort());
  assert.equal([...xml.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, locs.length);
  assert.equal((xml.match(/<url>/g) ?? []).length, (xml.match(/<\/url>/g) ?? []).length);
  assert.match(readFileSync(dist("robots.txt"), "utf8"), /^Sitemap: https:\/\/\S+\/sitemap\.xml$/m);
});
