import { ArrowUpRight } from 'lucide-react';
import { copy, type Lang } from '@/lib/landing-copy';
import { APP_URL } from '@/lib/config';
import { INFO_SLUGS, infoPages, infoPath, type InfoSlug } from '@/lib/info-pages';

const HOME: Record<Lang, string> = { es: '/', en: '/en/' };

/** The links to About, Contact and Privacy, shared by the home and the info pages' footers. */
export const InfoLinks = ({ lang }: { lang: Lang }) => (
  <nav aria-label={lang === 'en' ? 'About Rinde' : 'Sobre Rinde'} className="footer-links">
    {INFO_SLUGS.map((slug) => <a key={slug} href={infoPath(slug, lang)}>{infoPages[lang][slug].nav}</a>)}
  </nav>
);

// About, Contact and Privacy: the bar and footer of the home page around plain reading text.
const InfoPage = ({ slug, lang }: { slug: InfoSlug; lang: Lang }) => {
  const t = copy[lang];
  const page = infoPages[lang][slug];
  const other: Lang = lang === 'es' ? 'en' : 'es';
  return (
    <div id="top">
      <header className="bar" data-bar>
        <div className="container bar-in">
          <a href={HOME[lang]} aria-label="Rinde" className="wordmark"><img src="/icon-192.png" width={32} height={32} alt="" />rinde</a>
          <div className="bar-end">
            <a href={infoPath(slug, other)} hrefLang={other} lang={other} className="langs">{t.otherLang}</a>
            <a href={APP_URL} data-open-app className="btn btn-quiet">{t.open}<ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </header>
      <main className="container info">
        <h1>{page.title}</h1>
        <p className="lead">{page.description}</p>
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </main>
      <footer className="container footer">
        <div className="footer-row">
          <a href={HOME[lang]}>{lang === 'en' ? 'Rinde home' : 'Inicio de Rinde'}</a>
          <InfoLinks lang={lang} />
        </div>
        <div className="footer-legal small"><p>{t.made}</p><p>{t.disclaimer}</p></div>
      </footer>
    </div>
  );
};

export default InfoPage;
