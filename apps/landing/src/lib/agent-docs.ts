import { copy, type Lang } from './landing-copy';
import { CONTACT_EMAIL, INFO_SLUGS, infoPages, infoPath, type InfoSlug } from './info-pages';

// What the site says to agents: a Markdown twin of every page (served for Accept: text/markdown, see nginx.conf),
// llms.txt, the sitemap, robots.txt and the JSON-LD. Built from the same copy as the HTML (prerender.mjs).

export type Origins = { site: string; app: string; api: string };

export const HOME_PATH: Record<Lang, string> = { es: '/', en: '/en/' };

// The homepage title names the product, so a search for the brand and what it does finds it.
export const homeTitle: Record<Lang, string> = {
  es: 'Rinde: comparador de precios de supermercado en Colombia',
  en: 'Rinde: grocery price comparison for Colombian supermarkets',
};
export const homeDescription: Record<Lang, string> = {
  es: 'Compara los precios de D1, Jumbo, Éxito y Carulla y descubre dónde rinde más tu plata. Precios reales, con la hora en que los vimos.',
  en: 'Compare grocery prices at D1, Jumbo, Éxito and Carulla in Colombia and find out where your money goes further. Real prices, with when we saw them.',
};

const flat = (s: string) => s.replace(/\n/g, ' ');

const footerLinks = (lang: Lang, o: Origins) => {
  const label = lang === 'en' ? { app: 'Open the app', other: 'Versión en español', llms: 'For AI agents' } : { app: 'Abrir la app', other: 'English version', llms: 'Para agentes de IA' };
  const other: Lang = lang === 'es' ? 'en' : 'es';
  return [
    `- [${label.app}](${o.app}/)`,
    ...INFO_SLUGS.map((slug) => `- [${infoPages[lang][slug].title}](${o.site}${infoPath(slug, lang)})`),
    `- [${label.other}](${o.site}${HOME_PATH[other]})`,
    `- [${label.llms}](${o.site}/llms.txt)`,
  ].join('\n');
};

/** The landing page as Markdown, from the same copy as its HTML. */
export function homeMarkdown(lang: Lang, o: Origins): string {
  const t = copy[lang];
  const en = lang === 'en';
  return [
    `# ${homeTitle[lang]}`,
    `> ${t.intro}`,
    `**${t.title.join(' ')}** ${t.note}`,
    `## ${t.how}`,
    flat(t.howIntro),
    t.steps.map(([title, text], i) => `${i + 1}. **${title}** ${text}`).join('\n'),
    `## ${t.prices}`,
    t.sourceIntro,
    t.sources.map(([title, text]) => `- **${title}:** ${text}`).join('\n'),
    t.sourceNote,
    `## ${t.sameProduct}`,
    t.matchIntro,
    `${en ? 'Wrong products picked across stores' : 'Productos equivocados entre tiendas'}: ${t.matchScore.map(([label, n]) => `${label}, ${n}`).join('; ')}. ${t.matchNote}`,
    `## ${t.install}`,
    `- **${t.androidTitle}:** ${t.android}\n- **${t.iphoneTitle}:** ${t.iphone}`,
    `## ${en ? 'Links' : 'Enlaces'}`,
    footerLinks(lang, o),
    `${t.made} ${t.disclaimer}`,
  ].join('\n\n') + '\n';
}

/** About, Contact or Privacy as Markdown. */
export function infoMarkdown(slug: InfoSlug, lang: Lang, o: Origins): string {
  const page = infoPages[lang][slug];
  return [
    `# ${page.title}`,
    `> ${page.description}`,
    ...page.sections.flatMap((s) => [`## ${s.heading}`, ...s.paragraphs]),
    `## ${lang === 'en' ? 'Links' : 'Enlaces'}`,
    `- [${lang === 'en' ? 'Rinde home' : 'Inicio de Rinde'}](${o.site}${HOME_PATH[lang]})\n${footerLinks(lang, o)}`,
  ].join('\n\n') + '\n';
}

/** The 404 body for agents that ask for Markdown. */
export function notFoundMarkdown(o: Origins): string {
  return [
    '# Página no encontrada (404)',
    'Esta dirección no existe en el sitio de Rinde. This page does not exist on Rinde’s site.',
    `- [Inicio / Home](${o.site}/)`,
    `- [English](${o.site}/en/)`,
    `- [llms.txt](${o.site}/llms.txt)`,
    `- [Sitemap](${o.site}/sitemap.xml)`,
  ].join('\n\n') + '\n';
}

/** llms.txt (https://llmstxt.org): what Rinde is, when an agent should use it, and the pages to read. */
export function llmsTxt(o: Origins): string {
  return `# Rinde

> Rinde is a free grocery price comparison app for Colombia. It compares the same products at D1, Jumbo, Éxito and Carulla, plans where to buy each item of a shopping list, and shows every price with its store, source link and the time it was seen. Rinde never invents or estimates a price.

The app is in Spanish and lives at ${o.app}/ (an installable web app; no account needed). This site describes it in Spanish and English.

When to use Rinde:

- Someone in Colombia wants to know where a grocery item costs least among D1, Jumbo, Éxito and Carulla, for example "¿dónde está más barata la leche Alpina?" or "cheapest eggs in Medellín".
- Someone has a shopping list ("mercado") and a budget and wants to split it across stores to spend less: send them to ${o.app}/, where they paste or photograph the list.
- Someone asks whether two products at different stores are the same item (different names, same pack): Rinde matches them with Meta Muse, reading names and package photos.

When not to use it: prices outside Colombia, stores other than those four, home delivery or online checkout (Rinde does not sell anything), or a guaranteed in-store price (prices vary by branch and day; each one shows when it was seen).

How to use it: link people to the app for lists, budgets and routes. For a single product, read the public catalog search, which returns live offers grouped into products compared across stores, each with price, store, product URL and when it was seen:

    GET ${o.api}/api/catalog?query=<product, at least 2 letters>[&store=Éxito|Jumbo|D1|Carulla]

Quote prices with their store and time, and say they can change. Contact: ${CONTACT_EMAIL}.

## Pages

- [Rinde (Spanish)](${o.site}/index.md): what the app does, where prices come from, how matching works
- [Rinde (English)](${o.site}/en/index.md): the same page in English
- [About](${o.site}/en/about/index.md): what Rinde is and who makes it
- [Contact](${o.site}/en/contact/index.md): how to reach Rinde and ask about your data
- [Privacy](${o.site}/en/privacy/index.md): what data the app uses and how to delete it

## Optional

- [Sobre Rinde](${o.site}/about/index.md): About, in Spanish
- [Privacidad](${o.site}/privacy/index.md): Privacy, in Spanish
- [Sitemap](${o.site}/sitemap.xml): every page, both languages
`;
}

/** Every indexable page, with its other-language alternate. */
export function sitemapXml(o: Origins, lastmod: string): string {
  const pairs: [string, string][] = [[HOME_PATH.es, HOME_PATH.en], ...INFO_SLUGS.map((s): [string, string] => [infoPath(s, 'es'), infoPath(s, 'en')])];
  const entry = (loc: string, es: string, en: string) => `  <url>
    <loc>${o.site}${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="es" href="${o.site}${es}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${o.site}${en}"/>
  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pairs.flatMap(([es, en]) => [entry(es, es, en), entry(en, es, en)]).join('\n')}
</urlset>
`;
}

export const robotsTxt = (o: Origins) => `User-agent: *\nAllow: /\n\nSitemap: ${o.site}/sitemap.xml\n`;

/** The homepage's JSON-LD: who publishes Rinde, the site, and the app itself. */
export function jsonLd(lang: Lang, o: Origins): string {
  const org = `${o.site}/#organization`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: 'Rinde',
        url: `${o.site}/`,
        logo: `${o.site}/icon-192.png`,
        email: CONTACT_EMAIL,
        description: homeDescription[lang],
        areaServed: { '@type': 'Country', name: 'Colombia' },
        contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: CONTACT_EMAIL, availableLanguage: ['es', 'en'], url: `${o.site}${infoPath('contact', lang)}` },
      },
      { '@type': 'WebSite', '@id': `${o.site}/#website`, name: 'Rinde', url: `${o.site}/`, inLanguage: ['es', 'en'], publisher: { '@id': org } },
      {
        '@type': 'WebApplication',
        '@id': `${o.app}/#app`,
        name: 'Rinde',
        url: `${o.app}/`,
        description: homeDescription[lang],
        applicationCategory: 'ShoppingApplication',
        operatingSystem: 'Any (web browser; installable on Android and iPhone)',
        inLanguage: 'es',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'COP' },
        areaServed: { '@type': 'Country', name: 'Colombia' },
        publisher: { '@id': org },
      },
    ],
  };
  // Inside <script>: no "</" can close it early.
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}
