// Renders the built page to static HTML: Spanish at /, English at /en/, and the 404 page, each with its
// own title, link previews and language alternates. The page then works before (or without) JavaScript;
// src/client.ts adds the live receipt (no hydration). Run after `vite build` and the SSR build (see package.json).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SITE = process.env.VITE_SITE_ORIGIN ?? "https://rinde.cool.chuventures.com";
const APP = process.env.VITE_APP_ORIGIN ?? "https://app.rinde.cool.chuventures.com";
const API = process.env.VITE_API_ORIGIN ?? "https://rinde-api.cool.chuventures.com";

const { renderPage, renderNotFound } = await import(new URL("./dist-ssr/entry-server.js", import.meta.url));
const template = readFileSync(new URL("./dist/index.html", import.meta.url), "utf8");

const pages = {
  es: {
    path: "/",
    title: "Rinde: el mismo mercado, más plata en tu bolsillo",
    description: "Compara los precios de D1, Jumbo, Éxito y Carulla y descubre dónde rinde más tu plata. Precios reales, con la hora en que los vimos.",
    locale: "es_CO",
    image: "/og-es.png",
  },
  en: {
    path: "/en/",
    title: "Rinde: same groceries, more money left over",
    description: "Compare grocery prices at D1, Jumbo, Éxito and Carulla in Colombia and find out where your money goes further. Real prices, with when we saw them.",
    locale: "en_US",
    image: "/og-en.png",
  },
};

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function head(lang) {
  const page = pages[lang];
  const other = pages[lang === "es" ? "en" : "es"];
  return [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}" />`,
    `<meta name="rinde-app" content="${APP}" />`,
    `<meta name="rinde-api" content="${API}" />`,
    `<link rel="canonical" href="${SITE}${page.path}" />`,
    `<link rel="alternate" hreflang="es" href="${SITE}/" />`,
    `<link rel="alternate" hreflang="en" href="${SITE}/en/" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
    `<link rel="preconnect" href="${API}" crossorigin />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Rinde" />`,
    `<meta property="og:locale" content="${page.locale}" />`,
    `<meta property="og:locale:alternate" content="${other.locale}" />`,
    `<meta property="og:url" content="${SITE}${page.path}" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:image" content="${SITE}${page.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escape(page.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(page.title)}" />`,
    `<meta name="twitter:description" content="${escape(page.description)}" />`,
    `<meta name="twitter:image" content="${SITE}${page.image}" />`,
  ].join("\n    ");
}

const fill = (html, lang, headHtml, appHtml) =>
  html.replace("%LANG%", lang).replace("<!--head-->", headHtml).replace("<!--app-->", appHtml);

writeFileSync(new URL("./dist/index.html", import.meta.url), fill(template, "es", head("es"), renderPage("es")));
mkdirSync(new URL("./dist/en/", import.meta.url), { recursive: true });
writeFileSync(new URL("./dist/en/index.html", import.meta.url), fill(template, "en", head("en"), renderPage("en")));

// The 404 page needs no script: drop the app bundle and the handoff.
const notFound = fill(template, "es", `<title>Página no encontrada | Rinde</title>\n    <meta name="robots" content="noindex" />`, renderNotFound())
  .replace(/\s*<script type="module"[^>]*><\/script>/, "")
  .replace(/\s*<script src="\/handoff\.js"><\/script>/, "");
writeFileSync(new URL("./dist/404.html", import.meta.url), notFound);

// Assets only the server render references (the photos) were emitted by the SSR build.
const ssrAssets = new URL("./dist-ssr/static/", import.meta.url);
if (existsSync(ssrAssets)) cpSync(ssrAssets, new URL("./dist/static/", import.meta.url), { recursive: true, force: false });
rmSync(new URL("./dist-ssr/", import.meta.url), { recursive: true, force: true });
console.log("prerendered /, /en/ and 404.html");
