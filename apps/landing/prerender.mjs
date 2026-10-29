// Renders the built page to static HTML: Spanish at /, English at /en/, About, Contact and Privacy in both,
// and the 404 page, each with its own title, link previews and language alternates. Every page also gets a
// Markdown twin (index.md, 404.md) that nginx serves for Accept: text/markdown, plus llms.txt, sitemap.xml
// and robots.txt. The page then works before (or without) JavaScript;
// src/client.ts adds the live receipt (no hydration). Run after `vite build` and the SSR build (see package.json).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SITE = process.env.VITE_SITE_ORIGIN ?? "https://rinde.cool.chuventures.com";
const APP = process.env.VITE_APP_ORIGIN ?? "https://app.rinde.cool.chuventures.com";
const API = process.env.VITE_API_ORIGIN ?? "https://rinde-api.cool.chuventures.com";

const ssr = await import(new URL("./dist-ssr/entry-server.js", import.meta.url));
const { renderPage, renderInfo, renderNotFound, INFO_SLUGS, infoPages, infoPath, homeTitle, homeDescription } = ssr;
const origins = { site: SITE, app: APP, api: API };
const template = readFileSync(new URL("./dist/index.html", import.meta.url), "utf8");

const pages = {
  es: {
    path: "/",
    title: homeTitle.es,
    shareTitle: "Rinde: el mismo mercado, más plata en tu bolsillo",
    description: homeDescription.es,
    locale: "es_CO",
    image: "/og-es.png",
  },
  en: {
    path: "/en/",
    title: homeTitle.en,
    shareTitle: "Rinde: same groceries, more money left over",
    description: homeDescription.en,
    locale: "en_US",
    image: "/og-en.png",
  },
};

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function head(lang, page = pages[lang], alternates = { es: pages.es.path, en: pages.en.path }, extra = []) {
  const other = pages[lang === "es" ? "en" : "es"];
  const share = page.shareTitle ?? page.title;
  return [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}" />`,
    `<meta name="rinde-app" content="${APP}" />`,
    `<meta name="rinde-api" content="${API}" />`,
    `<link rel="canonical" href="${SITE}${page.path}" />`,
    `<link rel="alternate" hreflang="es" href="${SITE}${alternates.es}" />`,
    `<link rel="alternate" hreflang="en" href="${SITE}${alternates.en}" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${alternates.es}" />`,
    `<link rel="alternate" type="text/markdown" href="${SITE}${page.path}index.md" />`,
    `<link rel="preconnect" href="${API}" crossorigin />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Rinde" />`,
    `<meta property="og:locale" content="${page.locale}" />`,
    `<meta property="og:locale:alternate" content="${other.locale}" />`,
    `<meta property="og:url" content="${SITE}${page.path}" />`,
    `<meta property="og:title" content="${escape(share)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:image" content="${SITE}${page.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escape(page.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(share)}" />`,
    `<meta name="twitter:description" content="${escape(page.description)}" />`,
    `<meta name="twitter:image" content="${SITE}${page.image}" />`,
    ...extra,
  ].join("\n    ");
}

const fill = (html, lang, headHtml, appHtml) =>
  html.replace("%LANG%", lang).replace("<!--head-->", headHtml).replace("<!--app-->", appHtml);

const out = (path, text) => {
  const url = new URL(`./dist/${path}`, import.meta.url);
  mkdirSync(new URL("./", url), { recursive: true });
  writeFileSync(url, text);
};
const ld = (lang) => `<script type="application/ld+json">${ssr.jsonLd(lang, origins)}</script>`;

for (const lang of ["es", "en"]) {
  const dir = pages[lang].path.slice(1);
  out(`${dir}index.html`, fill(template, lang, head(lang, pages[lang], undefined, [ld(lang)]), renderPage(lang)));
  out(`${dir}index.md`, ssr.homeMarkdown(lang, origins));
  for (const slug of INFO_SLUGS) {
    const info = infoPages[lang][slug];
    const page = { ...pages[lang], path: infoPath(slug, lang), title: `${info.title} | Rinde`, shareTitle: undefined, description: info.description };
    const alternates = { es: infoPath(slug, "es"), en: infoPath(slug, "en") };
    out(`${page.path.slice(1)}index.html`, fill(template, lang, head(lang, page, alternates), renderInfo(slug, lang)));
    out(`${page.path.slice(1)}index.md`, ssr.infoMarkdown(slug, lang, origins));
  }
}
out("llms.txt", ssr.llmsTxt(origins));
out("sitemap.xml", ssr.sitemapXml(origins, new Date().toISOString().slice(0, 10)));
out("robots.txt", ssr.robotsTxt(origins));
out("404.md", ssr.notFoundMarkdown(origins));

// The 404 page needs no script: drop the app bundle and the handoff.
const notFound = fill(template, "es", `<title>Página no encontrada | Rinde</title>\n    <meta name="robots" content="noindex" />`, renderNotFound())
  .replace(/\s*<script type="module"[^>]*><\/script>/, "")
  .replace(/\s*<script src="\/handoff\.js"><\/script>/, "");
writeFileSync(new URL("./dist/404.html", import.meta.url), notFound);

// Assets only the server render references (the photos) were emitted by the SSR build.
const ssrAssets = new URL("./dist-ssr/static/", import.meta.url);
if (existsSync(ssrAssets)) cpSync(ssrAssets, new URL("./dist/static/", import.meta.url), { recursive: true, force: false });
rmSync(new URL("./dist-ssr/", import.meta.url), { recursive: true, force: true });
console.log("prerendered /, /en/, about, contact, privacy, their Markdown, 404, llms.txt, sitemap.xml and robots.txt");
