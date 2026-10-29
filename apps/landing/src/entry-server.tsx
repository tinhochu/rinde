import { renderToString } from "react-dom/server";
import Index from "./pages/Index";
import InfoPage from "./pages/InfoPage";
import NotFound from "./pages/NotFound";
import type { Lang } from "./lib/landing-copy";
import type { InfoSlug } from "./lib/info-pages";

export const renderPage = (lang: Lang) => renderToString(<Index lang={lang} />);
export const renderInfo = (slug: InfoSlug, lang: Lang) => renderToString(<InfoPage slug={slug} lang={lang} />);
export const renderNotFound = () => renderToString(<NotFound />);
export { INFO_SLUGS, infoPages, infoPath } from "./lib/info-pages";
export { homeDescription, homeMarkdown, homeTitle, infoMarkdown, jsonLd, llmsTxt, notFoundMarkdown, robotsTxt, sitemapXml } from "./lib/agent-docs";
