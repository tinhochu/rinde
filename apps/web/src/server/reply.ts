import "server-only";
import { allowedOrigins } from "./origins";

/** Where the app is served, for the link in a reply: APP_URL, else the first allowed web origin. */
export function appUrl(): string {
  return (process.env["APP_URL"] || allowedOrigins[0] || "http://localhost:8081").replace(/\/$/, "");
}

export type ReplyOutcome = { status: "accepted" | "rejected"; message: string | null; receiptId: string | null };

/**
 * The reply to a forwarded invoice email: a link to review an accepted invoice, or the rejection
 * message. Never prices, totals or lines (einvoice-intake spec).
 */
export function intakeReply(outcome: ReplyOutcome): { subject: string; text: string; html: string } {
  if (outcome.status === "accepted" && outcome.receiptId) {
    const link = `${appUrl()}/receipt?draft=${encodeURIComponent(outcome.receiptId)}`;
    const text = [
      "Recibimos tu factura electrónica.",
      "",
      "Revísala y envía sus precios desde Rinde, en el celular donde copiaste la dirección:",
      link,
      "",
      "Si no la revisas en 24 horas, la descartamos.",
    ].join("\n");
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;color:#1D2A21">
<p style="font-size:15px">Recibimos tu factura electrónica.</p>
<p style="font-size:15px">Revísala y envía sus precios desde Rinde, en el celular donde copiaste la dirección.</p>
<p><a href="${link}" style="display:inline-block;background:#1F7A4D;color:#FFFFFF;padding:10px 16px;border-radius:10px;font-weight:700;text-decoration:none">Revisar factura</a></p>
<p style="font-size:13px;color:#5D6B62">Si no la revisas en 24 horas, la descartamos.</p>
</div>`;
    return { subject: "Tu factura está lista para revisar en Rinde", text, html };
  }
  const message = outcome.message ?? "No pudimos usar esta factura.";
  return {
    subject: "No pudimos usar tu factura en Rinde",
    text: `${message}\n\nPuedes reenviar otra factura de D1, Jumbo o Éxito a la misma dirección.`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;color:#1D2A21">
<p style="font-size:15px">${message.replace(/[<>&]/g, "")}</p>
<p style="font-size:13px;color:#5D6B62">Puedes reenviar otra factura de D1, Jumbo o Éxito a la misma dirección.</p>
</div>`,
  };
}

/** Sends the reply when outbound email is configured (RESEND_API_KEY and EMAIL_FROM); otherwise does nothing. */
export async function sendIntakeReply(to: string, outcome: ReplyOutcome, fetcher: typeof fetch = globalThis.fetch): Promise<boolean> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!key || !from) return false;
  const message = intakeReply(outcome);
  const response = await fetcher(`${(process.env["RESEND_API_URL"] || "https://api.resend.com").replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}`);
  return true;
}
