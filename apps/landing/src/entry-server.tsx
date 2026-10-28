import { renderToString } from "react-dom/server";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import type { Lang } from "./lib/landing-copy";

export const renderPage = (lang: Lang) => renderToString(<Index lang={lang} />);
export const renderNotFound = () => renderToString(<NotFound />);
