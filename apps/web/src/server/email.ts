import "server-only";

export type CodePurpose = "sign-in" | "email-verification" | "forget-password" | "change-email";

const resendKey = process.env["RESEND_API_KEY"];
const from = process.env["EMAIL_FROM"];

/**
 * How codes reach people: Resend when RESEND_API_KEY and EMAIL_FROM are set; in development without
 * them, the server log (so the flow can be tried locally); otherwise not at all, and the app hides
 * every flow that needs an email.
 */
export const emailDelivery: "resend" | "log" | null =
  resendKey && from ? "resend" : process.env.NODE_ENV === "development" ? "log" : null;

const SUBJECT: Record<CodePurpose, (code: string) => string> = {
  "sign-in": (c) => `${c} es tu código para entrar a Rinde`,
  "email-verification": (c) => `${c} es tu código para confirmar tu correo en Rinde`,
  "forget-password": (c) => `${c} es tu código para cambiar tu contraseña de Rinde`,
  "change-email": (c) => `${c} es tu código para cambiar tu correo en Rinde`,
};

const PURPOSE: Record<CodePurpose, string> = {
  "sign-in": "entrar a tu cuenta de Rinde",
  "email-verification": "confirmar tu correo en Rinde",
  "forget-password": "cambiar tu contraseña de Rinde",
  "change-email": "cambiar tu correo en Rinde",
};

/** The message for a one-time code, in plain text and simple HTML. */
export function codeEmail(code: string, purpose: CodePurpose, minutes: number) {
  const text = [
    `Tu código para ${PURPOSE[purpose]} es:`,
    "",
    code,
    "",
    `Vence en ${minutes} minutos y solo sirve una vez.`,
    "Si no lo pediste, ignora este correo: nadie puede entrar sin el código.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;color:#1D2A21">
<p style="font-size:15px">Tu código para ${PURPOSE[purpose]} es:</p>
<p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#1F7A4D;margin:16px 0">${code}</p>
<p style="font-size:13px;color:#5D6B62">Vence en ${minutes} minutos y solo sirve una vez. Si no lo pediste, ignora este correo: nadie puede entrar sin el código.</p>
</div>`;
  return { subject: SUBJECT[purpose](code), text, html };
}

/** Sends a one-time code. Throws when the provider refuses, so the failure is logged. */
export async function sendCode(email: string, code: string, purpose: CodePurpose, minutes: number) {
  const message = codeEmail(code, purpose, minutes);
  if (emailDelivery === "log") {
    console.info(`[auth] ${purpose} code for ${email}: ${code}`);
    return;
  }
  if (emailDelivery !== "resend") throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
}
