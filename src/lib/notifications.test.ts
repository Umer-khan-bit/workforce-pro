import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { markAllRead, markRead, notifyUser, unreadCount } from "./notifications";
import { TEMPLATE_SEEDS } from "./messageTemplates";

describe("the new templates", () => {
  it("every template only uses the placeholders it declares", () => {
    for (const t of TEMPLATE_SEEDS) {
      const used = [...`${t.subject} ${t.body}`.matchAll(/\{\{\s*([A-Za-z0-9]+)\s*\}\}/g)].map((m) => m[1]);
      for (const name of used) expect([...t.variables, "brandName"], `${t.key} uses {{${name}}}`).toContain(name);
    }
  });
  it("has the course templates", () => {
    expect(TEMPLATE_SEEDS.map((t) => t.key)).toEqual(expect.arrayContaining(["COURSE_ENROLLED_IN_APP", "COURSE_COMPLETED_IN_APP"]));
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("notifications (real database)", () => {
  const tag = `ntf${Date.now().toString(36)}`;
  let userId: string;
  let otherId: string;
  let inactiveId: string;

  beforeAll(async () => {
    const mk = async (name: string, isActive = true) =>
      (await prisma.user.create({ data: { email: `${tag}-${name}@example.test`, name, password: await hashPassword("x-pass-12345"), role: "CANDIDATE", isActive, emailVerified: new Date() } })).id;
    userId = await mk("me");
    otherId = await mk("other");
    inactiveId = await mk("inactive", false);
  }, 30_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId, inactiveId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId, inactiveId] } } });
  }, 30_000);

  const values = { candidateName: "Sam", courseTitle: "Maths" };

  it("an in-app template becomes a notification with the placeholders filled in", async () => {
    expect(await notifyUser(prisma, { userId, templateKey: "COURSE_ENROLLED_IN_APP", type: "TRAINING_UPDATE", values, link: "/candidate/training" })).toBe(true);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId } });
    expect(n).toMatchObject({ channel: "IN_APP", type: "TRAINING_UPDATE", title: "You joined Maths", link: "/candidate/training", readAt: null });
    expect(n.message).toContain("Hello Sam");
    expect(n.sentAt).not.toBeNull();
    expect(n.message).not.toContain("{{");
  });

  it("an email template is sent (logged without SMTP), and a record is kept", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const sent = await notifyUser(prisma, { userId, templateKey: "TOP_PERFORMER_EMAIL", type: "TOP_PERFORMER", values: { candidateName: "Sam" } });
      expect(sent).toBe(false); // not really delivered: SMTP is not configured
      const text = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(text).toContain(`${tag}-me@example.test`);
      expect(text).toContain("Top Performer");
    } finally {
      log.mockRestore();
      if (prev !== undefined) process.env.SMTP_HOST = prev;
    }
    const rec = await prisma.notification.findFirstOrThrow({ where: { userId, channel: "EMAIL" } });
    expect(rec.sentAt).toBeNull();
    expect(rec.title).toMatch(/Top Performer/);
  });

  it("sends nothing for a missing or switched-off template, or for an inactive user", async () => {
    expect(await notifyUser(prisma, { userId, templateKey: "NO_SUCH_TEMPLATE", type: "GENERAL", values })).toBe(false);
    const off = { messageTemplate: { findUnique: async () => ({ key: "X", channel: "IN_APP", subject: "s", body: "b", isActive: false }) }, siteSetting: prisma.siteSetting, notification: prisma.notification, user: prisma.user };
    const before = await prisma.notification.count({ where: { userId } });
    expect(await notifyUser(off as never, { userId, templateKey: "X", type: "GENERAL", values })).toBe(false);
    expect(await notifyUser(prisma, { userId: inactiveId, templateKey: "COURSE_ENROLLED_IN_APP", type: "TRAINING_UPDATE", values })).toBe(false);
    expect(await prisma.notification.count({ where: { userId } })).toBe(before);
    expect(await prisma.notification.count({ where: { userId: inactiveId } })).toBe(0);
  });

  it("never throws: a failure must not break the action that triggered it", async () => {
    const broken = { messageTemplate: { findUnique: async () => { throw new Error("database down"); } }, siteSetting: prisma.siteSetting, notification: prisma.notification, user: prisma.user };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await notifyUser(broken as never, { userId, templateKey: "X", type: "GENERAL", values })).toBe(false);
    } finally {
      err.mockRestore();
    }
  });

  it("counts, reads and clears only the owner's unread in-app notifications", async () => {
    await notifyUser(prisma, { userId, templateKey: "COURSE_COMPLETED_IN_APP", type: "TRAINING_UPDATE", values });
    await notifyUser(prisma, { userId: otherId, templateKey: "COURSE_ENROLLED_IN_APP", type: "TRAINING_UPDATE", values });
    const mine = await prisma.notification.findMany({ where: { userId, channel: "IN_APP" } });
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: otherId } });
    expect(await unreadCount(prisma, userId)).toBe(mine.length); // email records do not count

    expect(await markRead(prisma, userId, theirs.id)).toBe(false); // somebody else's
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    expect(await markRead(prisma, userId, mine[0].id)).toBe(true);
    expect(await markRead(prisma, userId, mine[0].id)).toBe(true); // already read: still theirs
    expect(await unreadCount(prisma, userId)).toBe(mine.length - 1);

    expect(await markAllRead(prisma, userId)).toBe(mine.length - 1);
    expect(await unreadCount(prisma, userId)).toBe(0);
    expect(await unreadCount(prisma, otherId)).toBe(1); // untouched
  });
});
