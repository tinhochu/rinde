import { ShoppingBasket } from "lucide-react";
import type { Copy, Lang } from "@/lib/landing-copy";

/**
 * The receipt in the hero. The page ships with text and no numbers; src/client.ts prints today's
 * prices for one product into [data-live-receipt] once the catalog answers.
 */
export function LiveReceipt({ t, lang }: { t: Copy; lang: Lang }) {
  const words = { lang, units: t.units, seen: t.seen, receipt: t.receipt, lowest: t.lowest, difference: t.difference, live: t.live };
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><span className="wordmark text-2xl">rinde ✳</span><ShoppingBasket size={21} strokeWidth={1.3} aria-hidden="true" /></div>
      <p className="mb-4 border-b border-dashed border-primary/30 pb-4 font-mono text-[9px] tracking-wider">{t.receiptTitle}</p>
      <div data-live-receipt={JSON.stringify(words)} aria-live="polite">
        <p className="font-mono text-[11px] leading-relaxed">{t.waiting}</p>
      </div>
    </>
  );
}
