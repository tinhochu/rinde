import { ArrowUpRight, ArrowRight, ArrowUp, Check, ChevronDown, Leaf, ShoppingBasket, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveReceipt } from '@/components/live-receipt';
import { copy, type Lang } from '@/lib/landing-copy';
import { APP_URL } from '@/lib/config';
import produceAisle from '@/assets/photos/produce-aisle.webp';
import groceryCart from '@/assets/photos/grocery-cart.webp';

const HOME: Record<Lang, string> = { es: '/', en: '/en/' };

// Rendered to static HTML at build time (prerender.mjs). The few things that happen in the browser
// (the live receipt, the language links, the English hint) are in src/client.ts, not React.
const Index = ({ lang }: { lang: Lang }) => {
  const t = copy[lang];
  const other: Lang = lang === 'es' ? 'en' : 'es';
  // Same tab: from here the visitor's old app data (if any) is handed to the app (public/handoff.js).
  const openApp = (label: string, light = false) => <Button asChild className={`h-14 rounded-full px-7 text-sm font-semibold shadow-none ${light ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}><a href={APP_URL} data-open-app>{label}<ArrowUpRight className="ml-5 h-5 w-5" aria-hidden="true" /></a></Button>;
  const languageSwitch = (
    <div className="flex items-center gap-2 text-xs">
      {(['en', 'es'] as const).map((l, i) => (
        <span key={l} className="flex items-center gap-2">
          {i > 0 && <span className="opacity-30" aria-hidden="true">/</span>}
          {l === lang
            ? <span aria-current="page" className="font-bold underline underline-offset-4">{t.thisLang}</span>
            : <a href={HOME[l]} hrefLang={l} lang={l} className="opacity-60 hover:opacity-100">{t.otherLang}</a>}
        </span>
      ))}
    </div>
  );
  const installSteps = (title: string, text: string) => (
    <details className="group border-b border-primary/25">
      <summary className="flex cursor-pointer list-none items-center justify-between py-6 text-base font-medium [&::-webkit-details-marker]:hidden">{title}<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="pb-6 text-sm leading-7 text-[var(--body-ink)]">{text} <a href={APP_URL} data-open-app className="block pt-3 font-semibold text-primary underline">{t.open} ↗</a></div>
    </details>
  );

  return (
    <div id="top" className="overflow-hidden bg-background text-primary">
      {lang === 'es' && <div id="read-en" hidden className="on-yellow px-4 py-2.5 text-center text-xs"><a href={HOME[other]} hrefLang={other} lang={other} className="font-semibold underline underline-offset-4">{t.readOther}</a></div>}
      <div className="bg-primary px-4 py-2.5 text-center text-[11px] tracking-[.06em] text-primary-foreground">{t.announcement} <span aria-hidden="true" className="ml-2">✳</span></div>
      <header className="page-width flex h-24 items-center justify-between gap-5 border-b border-primary/20">
        <a href={HOME[lang]} aria-label="Rinde" className="wordmark flex items-center gap-1.5 text-[42px] leading-none">rinde<span className="mb-4 text-[28px]" aria-hidden="true">✳</span></a>
        <nav aria-label={lang === 'en' ? 'Main navigation' : 'Navegación principal'} className="hidden items-center gap-9 text-[13px] font-medium md:flex"><a className="nav-link" href="#how-it-works">{t.how}</a><a className="nav-link" href="#our-prices">{t.prices}</a><a className="nav-link" href="#on-your-phone">{t.install}</a></nav>
        <div className="flex items-center gap-4 sm:gap-7">{languageSwitch}<a href={APP_URL} data-open-app className="hidden items-center gap-3 rounded-full border border-primary/40 px-5 py-2.5 text-xs font-semibold sm:flex">{t.open}<ArrowUpRight size={16} aria-hidden="true" /></a></div>
      </header>

      <main>
        <section className="page-width grid gap-12 pb-16 pt-12 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:pb-20 lg:pt-16">
          <div className="relative z-10 lg:pb-10"><p className="eyebrow mb-7 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--tomato)]" />{t.eyebrow}</p><h1 className="editorial hero-title"><span className="block">{t.title[0]}</span><span className="block">{t.title[1]}</span><span className="block italic text-[var(--tomato)]">{t.title[2]}</span></h1><p className="mt-7 max-w-[370px] text-[15px] leading-[1.8] text-[var(--body-ink)]">{t.intro}</p><div className="mt-8">{openApp(t.cta)}</div><p className="mt-4 flex items-center gap-2 text-[11px] text-[var(--body-ink)]"><Check size={13} aria-hidden="true" />{t.note}</p></div>
          <div className="hero-scene relative min-h-[540px] sm:min-h-[580px] lg:min-h-[540px]">
            <div className="absolute inset-x-0 top-1 h-[390px] overflow-hidden rounded-[8px] sm:left-8 sm:h-[425px] lg:left-4"><img className="h-full w-full object-cover" src={produceAisle} width={800} height={640} alt={t.photo} fetchPriority="high" /><div className="absolute left-5 top-5 flex h-20 w-20 -rotate-12 items-center justify-center rounded-full on-yellow text-center text-[11px] font-bold leading-tight">{lang === 'en' ? <>EVERY<br />PESO<br />COUNTS</> : <>CADA<br />PESO<br />CUENTA</>}</div></div>
            <div className="receipt absolute bottom-0 right-1 w-[280px] rotate-[5deg] bg-[var(--paper)] px-6 pb-8 pt-6 shadow-xl sm:right-5 sm:w-[300px] lg:right-[-10px]" role="region" aria-label={t.receiptLabel}>
              <LiveReceipt t={t} lang={lang} />
            </div><span className="handwritten absolute bottom-7 left-0 hidden -rotate-6 text-xl sm:block lg:bottom-4">{t.handwritten}<span className="ml-2 inline-block rotate-12" aria-hidden="true">↗</span></span>
          </div>
        </section>

        <section className="border-y border-primary/20 bg-[var(--sand)]"><div className="page-width flex flex-col items-center justify-between gap-6 py-7 md:flex-row"><p className="eyebrow max-w-40 text-center leading-relaxed md:text-left">{t.stores}</p><div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[26px] font-bold tracking-[-1px] sm:gap-x-14 sm:text-[30px]"><span>D1</span><span>Jumbo</span><span>Éxito</span><span>Carulla</span></div><p className="max-w-40 text-center text-[11px] leading-relaxed md:text-right">{t.independent}</p></div></section>

        <section id="how-it-works" className="page-width scroll-mt-8 py-20 lg:py-24"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow mb-5">{t.howLabel}</p><h2 className="editorial section-title whitespace-pre-line">{t.howTitle}</h2></div><p className="max-w-64 pb-1 text-sm leading-7 text-[var(--body-ink)]">{t.howIntro}</p></div><ol className="mt-12 grid gap-9 md:grid-cols-3 md:gap-10">{t.steps.map(([title, desc], i) => <li key={title} className="border-t border-primary/30 pt-6"><div className="mb-7 flex items-center justify-between"><span className="editorial text-[42px] italic text-[var(--tomato)]">0{i + 1}</span>{i === 0 ? <ShoppingBasket size={29} strokeWidth={1.2} aria-hidden="true" /> : i === 1 ? <ArrowRight size={29} strokeWidth={1.2} aria-hidden="true" /> : <Leaf size={29} strokeWidth={1.2} aria-hidden="true" />}</div><h3 className="mb-3 text-lg font-semibold tracking-tight">{title}</h3><p className="max-w-80 text-[13px] leading-7 text-[var(--body-ink)]">{desc}</p></li>)}</ol></section>

        <section id="our-prices" className="scroll-mt-8 bg-[var(--sage)] py-16 lg:py-20"><div className="page-width grid items-center gap-10 md:grid-cols-2 lg:gap-20"><div className="relative"><img src={groceryCart} width={640} height={626} alt={lang === 'en' ? 'A shopping cart filled with fresh groceries' : 'Un carrito lleno de productos frescos'} loading="lazy" className="h-[360px] w-full rounded-lg object-cover lg:h-[440px]" /><div className="absolute -bottom-4 right-5 -rotate-6 rounded-sm on-yellow px-5 py-3 font-mono text-xs">{lang === 'en' ? 'Real life. Real receipts.' : 'Compras reales. Facturas reales.'}</div></div><div><p className="eyebrow mb-5">{t.sourceLabel}</p><h2 className="editorial section-title whitespace-pre-line">{t.sourceTitle}</h2><p className="mb-7 mt-5 text-sm leading-7 text-[var(--body-ink)]">{t.sourceIntro}</p>{t.sources.map(([title, desc]) => <div key={title} className="border-t border-primary/20 py-4"><h3 className="mb-1 text-sm font-semibold">{title}</h3><p className="text-xs leading-6 text-[var(--body-ink)]">{desc}</p></div>)}<p className="mt-3 text-[10px] leading-5 text-[var(--body-ink)]">{t.sourceNote}</p></div></div></section>

        <section id="on-your-phone" className="page-width grid scroll-mt-8 gap-8 py-20 md:grid-cols-2 md:gap-20"><div><Smartphone className="mb-5" size={28} strokeWidth={1.3} aria-hidden="true" /><h2 className="editorial text-4xl leading-tight">{t.installTitle}</h2><p className="mt-4 max-w-80 text-sm leading-7 text-[var(--body-ink)]">{t.installIntro}</p></div><div className="self-center">{installSteps('Android · Chrome', t.android)}{installSteps('iPhone · Safari', t.iphone)}</div></section>

        <section id="start" className="bg-primary py-16 text-primary-foreground lg:py-20"><div className="page-width flex flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><h2 className="editorial section-title whitespace-pre-line">{t.finalTitle}</h2><p className="mt-5 text-sm text-primary-foreground/80">{t.finalNote}</p></div><div className="flex flex-col items-center gap-5"><span className="hidden text-6xl text-[var(--yellow)] md:block" aria-hidden="true">✳</span>{openApp(t.cta, true)}</div></div></section>
      </main>
      <footer className="page-width py-9"><div className="flex flex-wrap items-center justify-between gap-5 border-b border-primary/20 pb-7"><div className="flex items-center gap-6"><a href="#top" className="wordmark text-3xl">rinde ✳</a><span className="text-xs">{t.footer}</span></div><a href="#top" className="flex items-center gap-3 text-xs">{t.top}<ArrowUp size={15} aria-hidden="true" /></a></div><div className="flex flex-col justify-between gap-3 pt-5 text-[10px] text-[var(--body-ink)] sm:flex-row"><p>{t.made} <span aria-hidden="true">🇨🇴</span></p><p>{t.disclaimer}</p></div></footer>
    </div>
  );
};

export default Index;
