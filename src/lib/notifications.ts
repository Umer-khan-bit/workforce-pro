import type { NotificationType, PrismaClient } from "@prisma/client";
import { sendEmail } from "@/lib/mail";
import { renderTemplate } from "@/lib/messageTemplates";
import { readSetting } from "@/lib/settings/store";

type Db = Pick<PrismaClient, "messageTemplate" | "siteSetting" | "notification" | "user">;

export type NotifyInput = {
  userId: string;
  /** Message template key (see message templates in the admin panel). The template decides IN_APP or EMAIL. */
  templateKey: string;
  type: NotificationType;
  /** Placeholder values; `brandName` is added automatically. */
  values: Record<string, string>;
  /** A path inside the app to open when the notification is clicked, for example /candidate/results. */
  link?: string;
};

/**
 * Sends one message from a template. An IN_APP template becomes a notification the user sees in the app;
 * an EMAIL template is emailed through SMTP (or written to the server console when SMTP is not set up),
 * and a record of it is kept. A template that is switched off, or missing, sends nothing. Never throws:
 * a notification must not break the action that triggered it. Returns whether something was sent.
 */
export async function notifyUser(db: Db, input: NotifyInput): Promise<boolean> {
  try {
    const template = await db.messageTemplate.findUnique({ where: { key: input.templateKey } });
    if (!template || !template.isActive) return false;
    const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true, isActive: true } });
    if (!user?.isActive) return false;

    const brand = await readSetting(db, "branding");
    const values = { brandName: brand.name, ...input.values };
    const title = renderTemplate(template.subject, values);
    const message = renderTemplate(template.body, values);

    if (template.channel === "IN_APP") {
      await db.notification.create({
        data: { userId: input.userId, type: input.type, channel: "IN_APP", title, message, link: input.link ?? null, sentAt: new Date() },
      });
      return true;
    }

    const { delivered } = await sendEmail({ to: user.email, subject: title, text: message });
    await db.notification.create({
      data: { userId: input.userId, type: input.type, channel: "EMAIL", title, message, link: input.link ?? null, sentAt: delivered ? new Date() : null },
    });
    return delivered;
  } catch (err) {
    console.error(`[notification] could not send ${input.templateKey}: ${err instanceof Error ? err.message : "unknown error"}`);
    return false;
  }
}

/** How many unread in-app notifications the user has. */
export function unreadCount(db: Pick<PrismaClient, "notification">, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
}

/** Marks one notification read. Only the owner's own notification can be changed. Returns false if it is not theirs. */
export async function markRead(db: Pick<PrismaClient, "notification">, userId: string, id: string): Promise<boolean> {
  const { count } = await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  if (count > 0) return true;
  return (await db.notification.count({ where: { id, userId } })) > 0;
}

export async function markAllRead(db: Pick<PrismaClient, "notification">, userId: string): Promise<number> {
  const { count } = await db.notification.updateMany({ where: { userId, channel: "IN_APP", readAt: null }, data: { readAt: new Date() } });
  return count;
}
