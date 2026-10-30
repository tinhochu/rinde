import { ArrowUp, ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import { LiveReceipt } from '@/components/live-receipt';
import { InfoLinks } from '@/pages/InfoPage';
import { copy, type Lang } from '@/lib/landing-copy';
import { APP_URL } from '@/lib/config';
import { STORE_LOGOS, STORE_ORDER } from '@/lib/store-logos';
import homeLight from '@/assets/screens/home-light.webp';
import homeDark from '@/assets/screens/home-dark.webp';
import compareLight from '@/assets/screens/compare-light.webp';
import compareDark from '@/assets/screens/compare-dark.webp';
import cartLight from '@/assets/screens/cart-light.webp';
import cartDark from '@/assets/screens/cart-dark.webp';
import receiptLight from '@/assets/screens/receipt-light.webp';
import receiptDark from '@/assets/screens/receipt-dark.webp';
import packCarulla from '@/assets/match/carulla-de-fruta.webp';
import packManzana from '@/assets/match/jumbo-manzana.webp';
import packFrutosRojos from '@/assets/match/jumbo-frutos-rojos.webp';

const HOME: Record<Lang, string> = { es: '/', en: '/en/' };

// The post announcing Rinde's hackathon entry; the banner asks visitors to like or share it.
const HACKATHON_POST = 'https://x.com/TinHoChu/status/2116007150791139559';

// The app's own screens, captured from production in both schemes; the page shows the one that matches the visitor's.
const STEP_SHOTS = [
  { light: compareLight, dark: compareDark, alt: 'compare' },
  { light: cartLight, dark: cartDark, alt: 'cart' },
  { light: receiptLight, dark: receiptDark, alt: 'receipt' },
] as const;

// Jumbo's two candidates for Carulla's McVitie's, named as Jumbo lists them; Muse picked the second.
const JUMBO_PACKS = [
  { name: 'Galletas Mcvities Manzana 174g', src: packManzana, w: 513, h: 250, alt: "Paquete verde de galletas McVitie's Go Ahead de manzana, 174 g", picked: false },
  { name: 'Galletas Mcvities Frutos Rojos 174g', src: packFrutosRojos, w: 516, h: 277, alt: "Paquete morado de galletas McVitie's Go Ahead de frutos rojos, 174 g", picked: true },
] as const;

const Screen = ({ light, dark, alt, width, height, first = false }: { light: string; dark: string; alt: string; width: number; height: number; first?: boolean }) => (
  <picture className="shot">
    <source media="(prefers-color-scheme: dark)" srcSet={dark} />
    {first
      ? <img src={light} width={width} height={height} alt={alt} fetchPriority="high" />
      : <img src={light} width={width} height={height} alt={alt} loading="lazy" decoding="async" />}
  </picture>
);

// Rendered to static HTML at build time (prerender.mjs). The few things that happen in the browser
// (the live receipt, the language links, the retracting bar, the English hint) are in src/client.ts, not React.
const Index = ({ lang }: { lang: Lang }) => {
  const t = copy[lang];
  const other: Lang = lang === 'es' ? 'en' : 'es';
  // Same tab: from here the visitor's old app data (if any) is handed to the app (public/handoff.js).
  const openApp = (label: string) => <a href={APP_URL} data-open-app className="btn btn-primary">{label}<ArrowUpRight size={20} aria-hidden="true" /></a>;
  const languageSwitch = (
    <div className="langs">
      {(['en', 'es'] as const).map((l, i) => (
        <span key={l} className="langs">
          {i > 0 && <span aria-hidden="true">/</span>}
          {l === lang
            ? <span aria-current="page">{t.thisLang}</span>
            : <a href={HOME[l]} hrefLang={l} lang={l}>{t.otherLang}</a>}
        </span>
      ))}
    </div>
  );
  const installSteps = (title: string, text: string) => (
    <details>
      <summary>{title}<ChevronDown size={24} aria-hidden="true" /></summary>
      <div className="answer"><p>{text}</p><a href={APP_URL} data-open-app>{t.open}<ArrowUpRight size={16} aria-hidden="true" /></a></div>
    </details>
  );

  return (
    <div id="top">
      {lang === 'es' && <div id="read-en" hidden className="hint"><a href={HOME[other]} hrefLang={other} lang={other}>{t.readOther}</a></div>}
      <p className="banner">{t.announcement} <a href={HACKATHON_POST} target="_blank" rel="noopener">{t.announcementLink}</a></p>
      <header className="bar" data-bar>
        <div className="container bar-in">
          <a href={HOME[lang]} aria-label="Rinde" className="wordmark"><img src="/icon-192.png" width={32} height={32} alt="" />rinde</a>
          <nav aria-label={lang === 'en' ? 'Main navigation' : 'Navegación principal'}><a href="#how-it-works">{t.how}</a><a href="#our-prices">{t.prices}</a><a href="#same-product">{t.sameProduct}</a><a href="#on-your-phone">{t.install}</a></nav>
          <div className="bar-end">{languageSwitch}<a href={APP_URL} data-open-app className="btn btn-quiet">{t.open}<ArrowUpRight size={16} aria-hidden="true" /></a></div>
        </div>
      </header>

      <main>
        <section className="container grid-12 hero" aria-labelledby="hero-title">
          <div className="hero-text">
            <h1 id="hero-title">{t.title[0]}<br />{t.title[1]} {t.title[2]}</h1>
            <p className="lead">{t.intro}</p>
            <div className="hero-act">{openApp(t.cta)}<p className="small"><Check size={16} aria-hidden="true" />{t.note}</p></div>
            <div className="stores">
              <p>{t.stores}</p>
              <ul>{STORE_ORDER.map((store) => <li key={store}><img src={STORE_LOGOS[store]} alt="" width={28} height={28} />{store}</li>)}</ul>
              <p className="small">{t.independent}</p>
            </div>
          </div>
          <figure className="hero-shot" data-kind="product">
            <Screen light={homeLight} dark={homeDark} alt={t.shots.home} width={600} height={1298} first />
            <figcaption className="small">{t.captured}</figcaption>
          </figure>
        </section>

        <section id="how-it-works" className="how">
          <div className="container">
            <div className="head split-head"><h2>{t.howTitle.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h2><p className="lead">{t.howIntro}</p></div>
            <ol className="rows">
              {t.steps.map(([title, desc], i) => (
                <li key={title} className={`grid-12 row${i === 0 ? ' row-lead' : ''}`}>
                  <div className="row-text"><h3>{title}</h3><p>{desc}</p></div>
                  <figure data-kind="product">
                    <Screen light={STEP_SHOTS[i].light} dark={STEP_SHOTS[i].dark} alt={t.shots[STEP_SHOTS[i].alt]} width={640} height={738} />
                    <figcaption className="small">{t.captured}</figcaption>
                  </figure>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="our-prices" className="prices">
          <div className="container grid-12">
            <div className="prices-text">
              <h2>{t.sourceTitle.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h2>
              <p className="lead">{t.sourceIntro}</p>
              <div className="sources">{t.sources.map(([title, desc]) => <div key={title}><h3>{title}</h3><p>{desc}</p></div>)}</div>
              <p className="small">{t.sourceNote}</p>
            </div>
            <div className="prices-proof">
              <div className="receipt" role="region" aria-label={t.receiptLabel}>
                <LiveReceipt t={t} lang={lang} />
              </div>
            </div>
          </div>
        </section>

        <section id="same-product" className="match">
          <div className="container">
            <div className="head split-head"><h2>{t.matchTitle.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h2><p className="lead">{t.matchIntro}</p></div>
            {/* A real answer from the held-out test (apps/web/eval/RESULTS-heldout.md, find-37), with the stores' own photos. */}
            <div className="grid-12 match-board">
              <figure className="pack pack-shopper">
                <figcaption><span className="small">{t.matchShopper}</span>Galletas MC.VITIES de fruta<br />174 g</figcaption>
                <div className="pack-photo"><img src={packCarulla} width={516} height={278} alt="Paquete morado de galletas McVitie's Go Ahead de frutos rojos, 174 g" loading="lazy" decoding="async" /></div>
              </figure>
              <div className="match-jumbo">
                <p className="match-ask">{t.matchAsk}</p>
                <ul className="packs">
                  {JUMBO_PACKS.map((p) => (
                    <li key={p.name} className={p.picked ? 'pack is-picked' : 'pack'}>
                      <div className="pack-photo"><img src={p.src} width={p.w} height={p.h} alt={p.alt} loading="lazy" decoding="async" /></div>
                      <p>{p.name}</p>
                      {p.picked && <p className="pack-picked"><Check size={16} aria-hidden="true" />{t.matchPicked}</p>}
                    </li>
                  ))}
                </ul>
                <blockquote className="match-reason"><p>{t.matchReason}</p><footer className="small">{t.matchBy}</footer></blockquote>
              </div>
            </div>
            <div className="grid-12 match-result">
              <dl className="match-score">{t.matchScore.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><span className="match-figure">{value}</span> {t.matchUnit}</dd></div>)}</dl>
              <p className="small match-note">{t.matchNote}</p>
            </div>
          </div>
        </section>

        <section id="on-your-phone" className="phone">
          <div className="container grid-12">
            <div className="phone-head"><h2>{t.installTitle}</h2><p>{t.installIntro}</p></div>
            <div className="phone-steps">{installSteps(t.androidTitle, t.android)}{installSteps(t.iphoneTitle, t.iphone)}</div>
          </div>
        </section>

        <section id="start" className="close">
          <div className="container grid-12 close-in">
            <h2>{t.finalTitle.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h2>
            <div className="close-act"><p>{t.finalNote}</p>{openApp(t.cta)}</div>
          </div>
        </section>
      </main>

      <footer className="container footer">
        <a href="#top" className="wordmark">rinde</a>
        <div className="footer-row">
          <p>{t.footer}</p>
          <div className="footer-links"><a href="#how-it-works">{t.how}</a><a href="#our-prices">{t.prices}</a><a href="#same-product">{t.sameProduct}</a><a href="#on-your-phone">{t.install}</a><a href="#top">{t.top}<ArrowUp size={16} aria-hidden="true" /></a></div>
        </div>
        <div className="footer-legal small"><p>{t.made}</p><p>{t.disclaimer}</p></div>
        <div className="footer-info small"><InfoLinks lang={lang} /></div>
      </footer>
    </div>
  );
};

export default Index;
