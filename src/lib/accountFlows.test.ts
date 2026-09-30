import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { consumeAuthToken, createAuthToken, hashToken } from "@/lib/authTokens";
import { requestPasswordReset, sendVerificationEmail } from "@/lib/accountEmails";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";

// These tests use the real database (accounts are created with a unique prefix and removed afterwards)
// and read the emailed link from the console, which is where emails go when SMTP is not configured.
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const run = `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const emailOf = (n: string) => `${n}-${run}@example.test`;

async function makeUser(name: string, over: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: emailOf(name), name, password: await hashPassword("old-password-1"), role: "CANDIDATE", ...over },
  });
}

/** Runs `action` and returns the link (and token) that was emailed, read from the console. */
async function captureLink(action: () => Promise<unknown>, path: string) {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await action();
    await vi.waitFor(() => {
      expect(log.mock.calls.some((c) => String(c[0]).includes(path))).toBe(true);
    });
    const text = log.mock.calls.map((c) => String(c[0])).find((t) => t.includes(path))!;
    const link = text.match(/https?:\/\/\S+/)![0];
    return { link, token: new URL(link).searchParams.get("token")!, text };
  } finally {
    log.mockRestore();
  }
}

const req = (url: string, body: unknown, ip: string) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
const freshIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}-${run}`;

describe.skipIf(!dbUp)("email links (real database)", () => {
  beforeAll(() => {
    vi.stubEnv("SMTP_HOST", ""); // log emails to the console instead of sending
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    const users = await prisma.user.findMany({ where: { email: { contains: run } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rateLimitHit.deleteMany({ where: { key: { contains: run } } });
  });

  describe("tokens", () => {
    it("are single-use, and only a hash is stored", async () => {
      const user = await makeUser("tok1");
      const raw = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60_000);
      const stored = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
      expect(stored.tokenHash).toBe(hashToken(raw));
      expect(stored.tokenHash).not.toContain(raw);

      expect(await consumeAuthToken(prisma, raw, "PASSWORD_RESET")).toEqual({ userId: user.id });
      expect(await consumeAuthToken(prisma, raw, "PASSWORD_RESET")).toBeNull();
    });

    it("are rejected when expired, of the wrong kind, unknown, or replaced by a newer one", async () => {
      const user = await makeUser("tok2");
      const expired = await createAuthToken(prisma, user.id, "PASSWORD_RESET", -1000);
      expect(await consumeAuthToken(prisma, expired, "PASSWORD_RESET")).toBeNull();

      const verification = await createAuthToken(prisma, user.id, "EMAIL_VERIFICATION", 60_000);
      expect(await consumeAuthToken(prisma, verification, "PASSWORD_RESET")).toBeNull();
      expect(await consumeAuthToken(prisma, "not-a-real-token-at-all", "EMAIL_VERIFICATION")).toBeNull();
      expect(await consumeAuthToken(prisma, "", "EMAIL_VERIFICATION")).toBeNull();

      const first = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60_000);
      const second = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60_000);
      expect(await consumeAuthToken(prisma, first, "PASSWORD_RESET")).toBeNull();
      expect(await consumeAuthToken(prisma, second, "PASSWORD_RESET")).not.toBeNull();
    });

    it("cannot be used twice even when two requests arrive at once", async () => {
      const user = await makeUser("tok3");
      const raw = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60_000);
      const results = await Promise.all(Array.from({ length: 6 }, () => consumeAuthToken(prisma, raw, "PASSWORD_RESET")));
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  describe("forgot password", () => {
    it("emails a template-based link that works once", async () => {
      const user = await makeUser("forgot1");
      const { link, text } = await captureLink(() => requestPasswordReset(prisma, user.email), "/reset-password");
      expect(link).toMatch(/\/reset-password\?token=/);
      expect(text).toContain("Reset your"); // subject from the MessageTemplate
      expect(text).toContain("60 minutes"); // from Settings > Accounts & trials
      expect(text).not.toContain("{{");
    });

    it("sends nothing for unknown or deactivated accounts", async () => {
      const inactive = await makeUser("forgot2", { isActive: false });
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await requestPasswordReset(prisma, emailOf("nobody"));
      await requestPasswordReset(prisma, inactive.email);
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
      expect(await prisma.authToken.count({ where: { userId: inactive.id } })).toBe(0);
    });

    it("answers the same for known and unknown addresses, and is rate-limited", async () => {
      const user = await makeUser("forgot3");
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const ip = freshIp();
      const known = await forgotPassword(req("/api/auth/forgot-password", { email: user.email }, ip));
      const unknown = await forgotPassword(req("/api/auth/forgot-password", { email: emailOf("ghost") }, ip));
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      log.mockRestore();

      expect((await forgotPassword(req("/api/auth/forgot-password", { email: "not-an-email" }, ip))).status).toBe(400);

      // Per address: a 4th request for the same address is refused.
      const same = emailOf("forgot3-limit");
      const ip2 = freshIp();
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await forgotPassword(req("/api/auth/forgot-password", { email: same }, ip2))).status);
      expect(codes).toEqual([200, 200, 200, 429]);

      // Per IP: 5 requests, then refused, whatever the address.
      const ip3 = freshIp();
      const ipCodes: number[] = [];
      for (let i = 0; i < 6; i++) ipCodes.push((await forgotPassword(req("/api/auth/forgot-password", { email: emailOf(`spread${i}`) }, ip3))).status);
      expect(ipCodes).toEqual([200, 200, 200, 200, 200, 429]);
    });
  });

  describe("reset password", () => {
    it("changes the password, ends older sessions, and the link cannot be reused", async () => {
      const user = await makeUser("reset1", { mustChangePassword: true });
      const { token } = await captureLink(() => requestPasswordReset(prisma, user.email), "/reset-password");
      const ip = freshIp();

      const short = await resetPassword(req("/api/auth/reset-password", { token, newPassword: "short" }, ip));
      expect(short.status).toBe(400);

      const ok = await resetPassword(req("/api/auth/reset-password", { token, newPassword: "brand-new-password-1" }, ip));
      expect(ok.status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await verifyPassword("brand-new-password-1", after.password)).toBe(true);
      expect(await verifyPassword("old-password-1", after.password)).toBe(false);
      expect(after.mustChangePassword).toBe(false);
      expect(after.passwordChangedAt).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { actorId: user.id, action: "PASSWORD_RESET_COMPLETED" } })).toBe(1);

      const again = await resetPassword(req("/api/auth/reset-password", { token, newPassword: "another-password-2" }, ip));
      expect(again.status).toBe(400);
      expect((await again.json()).error).toMatch(/invalid or has expired/);
      expect(await verifyPassword("brand-new-password-1", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password)).toBe(true);
    });

    it("rejects expired, unknown and deactivated-account links", async () => {
      const user = await makeUser("reset2");
      const expired = await createAuthToken(prisma, user.id, "PASSWORD_RESET", -1000);
      const ip = freshIp();
      expect((await resetPassword(req("/api/auth/reset-password", { token: expired, newPassword: "valid-password-1" }, ip))).status).toBe(400);
      expect((await resetPassword(req("/api/auth/reset-password", { token: "x".repeat(40), newPassword: "valid-password-1" }, ip))).status).toBe(400);

      const off = await makeUser("reset3", { isActive: false });
      const t = await createAuthToken(prisma, off.id, "PASSWORD_RESET", 60_000);
      expect((await resetPassword(req("/api/auth/reset-password", { token: t, newPassword: "valid-password-1" }, ip))).status).toBe(400);
    });

    it("an email-confirmation token cannot be used to reset a password", async () => {
      const user = await makeUser("reset4");
      const t = await createAuthToken(prisma, user.id, "EMAIL_VERIFICATION", 60_000);
      expect((await resetPassword(req("/api/auth/reset-password", { token: t, newPassword: "valid-password-1" }, freshIp()))).status).toBe(400);
    });

    it("limits guessing per IP", async () => {
      const ip = freshIp();
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) codes.push((await resetPassword(req("/api/auth/reset-password", { token: "y".repeat(40), newPassword: "valid-password-1" }, ip))).status);
      expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
      expect(codes[10]).toBe(429);
    });
  });

  describe("email verification", () => {
    it("emails a template-based link that confirms the address once", async () => {
      const user = await makeUser("verify1");
      const { token, text } = await captureLink(() => sendVerificationEmail(prisma, user), "/verify-email");
      expect(text).toContain("Confirm your email address");
      expect(text).toContain("48 hours");

      const ip = freshIp();
      expect((await verifyEmail(req("/api/auth/verify-email", { token }, ip))).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { actorId: user.id, action: "EMAIL_VERIFIED" } })).toBe(1);
      expect((await verifyEmail(req("/api/auth/verify-email", { token }, ip))).status).toBe(400);
    });

    it("a resent link replaces the old one", async () => {
      const user = await makeUser("verify2");
      const first = await captureLink(() => sendVerificationEmail(prisma, user), "/verify-email");
      const second = await captureLink(() => sendVerificationEmail(prisma, user), "/verify-email");
      const ip = freshIp();
      expect((await verifyEmail(req("/api/auth/verify-email", { token: first.token }, ip))).status).toBe(400);
      expect((await verifyEmail(req("/api/auth/verify-email", { token: second.token }, ip))).status).toBe(200);
    });

    it("blocks unverified users from verified-only actions, and lets verified users through", async () => {
      const unverified = await makeUser("verify3");
      const blocked = await requireVerifiedEmail(unverified.id);
      expect(blocked?.status).toBe(403);
      expect(await blocked!.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

      const verified = await makeUser("verify4", { emailVerified: new Date() });
      expect(await requireVerifiedEmail(verified.id)).toBeNull();
      expect((await requireVerifiedEmail("no-such-user"))?.status).toBe(403);
    });
  });
});
