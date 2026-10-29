import { ShoppingBasket } from "lucide-react";
import type { Copy, Lang } from "@/lib/landing-copy";

/**
 * The receipt beside "where the prices come from". The page ships with text and no numbers; src/client.ts
 * prints today's prices for one product into [data-live-receipt] once the catalog answers.
 */
export function LiveReceipt({ t, lang }: { t: Copy; lang: Lang }) {
  const words = { lang, units: t.units, seen: t.seen, receipt: t.receipt, lowest: t.lowest, difference: t.difference, live: t.live };
  return (
    <>
      <div className="receipt-head"><span className="wordmark">rinde</span><ShoppingBasket size={24} strokeWidth={1.5} aria-hidden="true" /></div>
      <p className="receipt-title">{t.receiptTitle}</p>
      <div data-live-receipt={JSON.stringify(words)} aria-live="polite">
        <p className="text-sm leading-relaxed">{t.waiting}</p>
      </div>
    </>
  );
}
