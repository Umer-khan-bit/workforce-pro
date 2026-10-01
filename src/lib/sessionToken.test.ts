import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { syncTokenWithDatabase } from "./sessionToken";

type Row = { isActive: boolean; passwordChangedAt: Date | null; mustChangePassword: boolean } | null;
const dbWith = (row: Row) =>
  ({ user: { findUnique: vi.fn().mockResolvedValue(row) } }) as unknown as Pick<PrismaClient, "user">;
const active = (over: Partial<NonNullable<Row>> = {}): Row => ({ isActive: true, passwordChangedAt: null, mustChangePassword: false, ...over });

describe("syncTokenWithDatabase", () => {
  it("takes mustChangePassword from the database, whatever the token says", async () => {
    const forced = await syncTokenWithDatabase({ sub: "u1", mustChangePassword: false }, dbWith(active({ mustChangePassword: true })));
    expect(forced?.mustChangePassword).toBe(true);

    const cleared = await syncTokenWithDatabase({ sub: "u1", mustChangePassword: true }, dbWith(active({ mustChangePassword: false })));
    expect(cleared?.mustChangePassword).toBe(false);
  });

  it("ends the session for a missing or deactivated user", async () => {
    expect(await syncTokenWithDatabase({ sub: "u1" }, dbWith(null))).toBeNull();
    expect(await syncTokenWithDatabase({ sub: "u1" }, dbWith(active({ isActive: false })))).toBeNull();
  });

  it("ends a session opened before a password reset, but not one opened after it", async () => {
    const changedAt = new Date("2026-10-01T12:00:30Z");
    const changedSeconds = Math.floor(changedAt.getTime() / 1000);
    expect(await syncTokenWithDatabase({ sub: "u1", iat: changedSeconds - 60 }, dbWith(active({ passwordChangedAt: changedAt })))).toBeNull();
    expect(await syncTokenWithDatabase({ sub: "u1", iat: changedSeconds }, dbWith(active({ passwordChangedAt: changedAt })))).not.toBeNull();
    expect(await syncTokenWithDatabase({ sub: "u1", iat: changedSeconds + 5 }, dbWith(active({ passwordChangedAt: changedAt })))).not.toBeNull();
  });

  it("leaves a token with no user id alone (nothing to look up)", async () => {
    const token = { mustChangePassword: true };
    expect(await syncTokenWithDatabase(token, dbWith(null))).toBe(token);
  });

  it("keeps the other token fields", async () => {
    const out = await syncTokenWithDatabase({ sub: "u1", role: "CANDIDATE", companyId: null } as { sub: string }, dbWith(active()));
    expect(out).toMatchObject({ sub: "u1", role: "CANDIDATE", companyId: null });
  });
});

describe("a value sent from the browser cannot clear the forced password change", () => {
  it("the token callback ignores a session.update() payload", async () => {
    const token = { sub: "u1", role: "CANDIDATE", companyId: null, mustChangePassword: true };
    const afterUpdate = await authConfig.callbacks.jwt({
      token,
      trigger: "update",
      session: { mustChangePassword: false, role: "PLATFORM_ADMIN" },
    } as never);
    expect(afterUpdate?.mustChangePassword).toBe(true);
    expect(afterUpdate?.role).toBe("CANDIDATE");
  });

  it("and the database still wins afterwards, even for a forged token value", async () => {
    // What the browser could try: a token claiming no change is needed, plus an update payload saying so.
    const forged = await authConfig.callbacks.jwt({
      token: { sub: "u1", role: "CANDIDATE", companyId: null, mustChangePassword: false },
      trigger: "update",
      session: { mustChangePassword: false },
    } as never);
    const synced = await syncTokenWithDatabase(forged!, dbWith(active({ mustChangePassword: true })));
    expect(synced?.mustChangePassword).toBe(true);
  });

  it("the sign-in callback still copies the flag from the user record that authorize() read from the database", async () => {
    const token = await authConfig.callbacks.jwt({
      token: { sub: "u1" },
      user: { id: "u1", role: "RECRUITER", companyId: "c1", mustChangePassword: true },
    } as never);
    expect(token).toMatchObject({ role: "RECRUITER", companyId: "c1", mustChangePassword: true });
  });
});

describe("wiring (guards against someone putting the client payload back)", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf-8");

  it("auth.config.ts never reads the update payload", () => {
    const source = read("src/auth.config.ts");
    expect(source).not.toMatch(/trigger/);
    expect(source).not.toMatch(/session\s*as\s*\{/);
    expect(source).not.toMatch(/Boolean\(\s*\(session/);
  });

  it("auth.ts runs every token through the database check", () => {
    const source = read("src/auth.ts");
    expect(source).toMatch(/syncTokenWithDatabase\(token, prisma\)/);
  });

  it("the change-password form does not send a value", () => {
    expect(read("src/app/change-password/ChangePasswordForm.tsx")).not.toMatch(/update\(\s*\{/);
  });
});
