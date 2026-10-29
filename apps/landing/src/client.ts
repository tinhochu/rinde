// What the landing page does in the browser. The HTML is complete without it (prerender.mjs).
import "./globals.css";
import { formatAge, formatPack, formatPrice, loadComparison, type Comparison } from "./lib/live-prices";
import { STORE_LOGOS } from "./lib/store-logos";

type Words = { lang: "es" | "en"; units: string; seen: string; receipt: string; lowest: string; difference: string; live: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Prints the comparison into the receipt, with the same look as the rest of it. Text only: API data never becomes HTML. */
function printReceipt(box: HTMLElement, words: Words, { product, offers }: Comparison) {
  const name = el("h3", "text-base font-semibold leading-snug", product.name);
  const size = el("p", "mb-4 mt-1 text-sm text-[var(--color-muted)]", [formatPack(product, words.units), "COP"].filter(Boolean).join(", "));

  const list = el("ul", "space-y-1 text-sm tabular-nums");
  offers.forEach((offer, i) => {
    const best = i === 0;
    const row = el("li", `flex items-start justify-between gap-3 ${best ? "-mx-2 rounded-sm bg-[var(--color-receipt-best)] px-2 py-2" : "py-1"}`);
    const left = el("span", "");
    const store = el("span", "inline-flex items-center gap-1.5");
    const logo = STORE_LOGOS[offer.store];
    if (logo) {
      const img = el("img", "size-5 rounded-full object-cover");
      img.src = logo;
      img.alt = "";
      img.width = 20;
      img.height = 20;
      store.append(img);
    }
    store.append(el("span", best ? "font-semibold" : "", offer.store));
    left.append(store);
    if (best) left.append(el("span", "ml-2 text-xs font-semibold text-[var(--color-accent)]", words.lowest));
    const age = `${words.seen} ${formatAge(offer.observedAt, words.lang)}${offer.source === "receipt" ? ` (${words.receipt})` : ""}`;
    left.append(el("span", "block text-xs text-[var(--color-muted)]", age));
    row.append(left, el(best ? "b" : "span", best ? "font-semibold" : "", formatPrice(offer.price)));
    list.append(row);
  });

  const diff = el("div", "mt-4 flex items-center justify-between gap-3 border-t border-dashed border-[var(--color-rule)] pt-4");
  diff.append(
    el("span", "max-w-32 text-sm", words.difference),
    el("span", "text-2xl font-semibold tabular-nums text-[var(--color-accent)]", formatPrice(offers[offers.length - 1].price - offers[0].price)),
  );

  box.replaceChildren(name, size, list, diff, el("p", "mt-4 text-xs leading-relaxed text-[var(--color-muted)]", words.live));
}

const receipt = document.querySelector<HTMLElement>("[data-live-receipt]");
if (receipt) {
  const words = JSON.parse(receipt.dataset.liveReceipt ?? "{}") as Words;
  loadComparison().then((comparison) => comparison && printReceipt(receipt, words, comparison));
}

// The language links open the other page at the section the visitor is reading.
document.querySelectorAll<HTMLAnchorElement>("header a[hreflang]").forEach((link) => {
  link.addEventListener("click", () => {
    let current = "";
    document.querySelectorAll("section[id]").forEach((section) => {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.3) current = section.id;
    });
    link.href = link.href.split("#")[0] + (current ? `#${current}` : "");
  });
});

// The bar slides up while the visitor reads down the page and comes back as soon as they scroll up.
const bar = document.querySelector<HTMLElement>("[data-bar]");
if (bar) {
  let last = window.scrollY;
  let queued = false;
  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (Math.abs(y - last) > 8) {
        bar.toggleAttribute("data-away", y > last && y > bar.offsetHeight * 3 && !bar.contains(document.activeElement));
        last = y;
      }
      queued = false;
    });
  }, { passive: true });
}

// On the Spanish page, a browser that prefers English over Spanish gets a link to /en/ (never a redirect).
const hint = document.getElementById("read-en");
if (hint) {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]).map((l) => l.toLowerCase());
  const en = langs.findIndex((l) => l.startsWith("en"));
  const es = langs.findIndex((l) => l.startsWith("es"));
  if (en !== -1 && (es === -1 || en < es)) hint.hidden = false;
}

// Browsers that still run the old app's service worker pick up its replacement (public/sw.js).
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
