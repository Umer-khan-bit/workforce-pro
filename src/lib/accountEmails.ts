import type { PrismaClient } from "@prisma/client";
import { createAuthToken } from "@/lib/authTokens";
import { sendEmail } from "@/lib/mail";
import { renderTemplate } from "@/lib/messageTemplates";
import { readSetting } from "@/lib/settings/store";

type Db = Pick<PrismaClient, "authToken" | "messageTemplate" | "siteSetting" | "user">;

/**
 * Base address used in emailed links. Set APP_BASE_URL in the environment. It is never taken from
 * the request, because a forged Host header could otherwise make a reset email point somewhere else.
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || "http://localhost:7310";
}

/** Fills a message template from the database and sends it. Returns whether it was really delivered. */
export async function sendTemplatedEmail(
  db: Pick<PrismaClient, "messageTemplate" | "siteSetting">,
  key: string,
  to: string,
  values: Record<string, string>
): Promise<boolean> {
  const template = await db.messageTemplate.findUnique({ where: { key } });
  if (!template) {
    console.error(`[email] template ${key} is missing; run the seed. Nothing was sent.`);
    return false;
  }
  const brand = await readSetting(db, "branding");
  const all = { brandName: brand.name, ...values };
  const { delivered } = await sendEmail({
    to,
    subject: renderTemplate(template.subject, all),
    text: renderTemplate(template.body, all),
  });
  return delivered;
}

type Recipient = { id: string; email: string; name: string | null };

/** Emails a password reset link. Reset and confirmation emails are security messages and are sent even if the template is switched off. */
export async function sendPasswordResetEmail(db: Db, user: Recipient): Promise<boolean> {
  const accounts = await readSetting(db, "accounts");
  const token = await createAuthToken(db, user.id, "PASSWORD_RESET", accounts.passwordResetMinutes * 60_000);
  return sendTemplatedEmail(db, "PASSWORD_RESET_EMAIL", user.email, {
    name: user.name ?? user.email,
    link: `${appBaseUrl()}/reset-password?token=${token}`,
    minutes: String(accounts.passwordResetMinutes),
  });
}

/** Emails an address-confirmation link. */
export async function sendVerificationEmail(db: Db, user: Recipient): Promise<boolean> {
  const accounts = await readSetting(db, "accounts");
  const token = await createAuthToken(db, user.id, "EMAIL_VERIFICATION", accounts.emailVerificationHours * 3_600_000);
  return sendTemplatedEmail(db, "EMAIL_VERIFICATION_EMAIL", user.email, {
    name: user.name ?? user.email,
    link: `${appBaseUrl()}/verify-email?token=${token}`,
    hours: String(accounts.emailVerificationHours),
  });
}

/**
 * Handles a "forgot password" request. Does nothing for unknown or deactivated accounts, and the
 * caller gives the same answer either way, so the form cannot be used to find out who has an account.
 */
export async function requestPasswordReset(db: Db, email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.isActive) return;
  await sendPasswordResetEmail(db, user);
}

/** Runs in the background after the response: a slow mail server must not show whether an account exists. */
export function inBackground(task: Promise<unknown>) {
  task.catch((err) => console.error(`[background task failed] ${err instanceof Error ? err.message : "unknown error"}`));
}
