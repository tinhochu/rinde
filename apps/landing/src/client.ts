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
  const name = el("h2", "font-mono text-sm font-bold", product.name);
  const size = el("p", "mb-4 mt-1 font-mono text-[10px] text-[var(--body-ink)]", [formatPack(product, words.units), "COP"].filter(Boolean).join(" · "));

  const list = el("ul", "space-y-2 font-mono text-xs");
  offers.forEach((offer, i) => {
    const best = i === 0;
    const row = el("li", `flex items-start justify-between gap-3 ${best ? "-mx-2 rounded-sm bg-[#e7ecda] px-2 py-2" : "py-0.5"}`);
    const left = el("span", "");
    const store = el("span", "inline-flex items-center gap-1.5");
    const logo = STORE_LOGOS[offer.store];
    if (logo) {
      const img = el("img", "size-4 rounded-full object-cover");
      img.src = logo;
      img.alt = "";
      img.width = 16;
      img.height = 16;
      store.append(img);
    }
    store.append(el("span", best ? "font-bold" : "", offer.store));
    left.append(store);
    if (best) left.append(el("span", "ml-1.5 text-[7px] font-bold", words.lowest));
    const age = `${words.seen} ${formatAge(offer.observedAt, words.lang)}${offer.source === "receipt" ? ` (${words.receipt})` : ""}`;
    left.append(el("span", "block text-[9px] text-[var(--body-ink)]", age));
    row.append(left, el(best ? "b" : "span", "", formatPrice(offer.price)));
    list.append(row);
  });

  const diff = el("div", "mt-4 flex items-center justify-between border-t border-dashed border-primary/30 pt-4");
  diff.append(
    el("span", "max-w-28 font-mono text-[10px]", words.difference),
    el("span", "text-2xl font-bold text-[var(--tomato)]", formatPrice(offers[offers.length - 1].price - offers[0].price)),
  );

  box.replaceChildren(name, size, list, diff, el("p", "mt-4 font-mono text-[8px] leading-relaxed text-[var(--body-ink)]", words.live));
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
