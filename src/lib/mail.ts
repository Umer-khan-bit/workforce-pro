import { createTransport, type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

let cached: { key: string; transport: Transporter } | null = null;

function transportFromEnv(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const key = `${host}:${port}:${user}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transport: createTransport({
        host,
        port,
        // Port 465 is implicit TLS; 587 (Brevo's default) upgrades with STARTTLS.
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      }),
    };
  }
  return cached.transport;
}

/**
 * Sends an email through the SMTP server in the environment (Brevo). When SMTP is not configured
 * the message, including any link in it, is written to the server console instead, so the app is
 * usable in development. Never throws: a failed send returns delivered = false.
 */
export async function sendEmail(mail: Mail): Promise<{ delivered: boolean }> {
  const transport = transportFromEnv();
  if (!transport) {
    // In development the whole message is shown, so reset and confirmation links can be followed. On a live site
    // nothing but the subject is written: the body can hold a login link, and links are never logged there.
    if (process.env.NODE_ENV === "production") console.log(`[email not sent: SMTP is not configured] Subject: ${mail.subject}`);
    else console.log(`[email not sent: SMTP is not configured]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return { delivered: false };
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    return { delivered: true };
  } catch (err) {
    // Log the reason only: never the message body (it holds a login link) or the SMTP password.
    console.error(`[email failed] could not send "${mail.subject}": ${err instanceof Error ? err.message : "unknown error"}`);
    return { delivered: false };
  }
}
