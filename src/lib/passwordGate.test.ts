import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

import { authConfig } from "@/auth.config";
import { PASSWORD_CHANGE_REQUIRED_BODY, isApiPath, passwordChangeBlocksApi } from "./passwordGate";

describe("passwordChangeBlocksApi", () => {
  it("blocks every ordinary API route while a password change is required", () => {
    for (const p of [
      "/api/tests/IQ/start",
      "/api/tests/sessions/abc/answer",
      "/api/account/profile",
      "/api/account",
      "/api/account/resend-verification",
      "/api/admin/questions",
      "/api/recruiters",
      "/api/signup/candidate",
    ]) {
      expect(passwordChangeBlocksApi(p, true), p).toBe(true);
    }
  });

  it("lets the change-password and sign-in/out routes through", () => {
    expect(passwordChangeBlocksApi("/api/account/change-password", true)).toBe(false);
    expect(passwordChangeBlocksApi("/api/auth/signout", true)).toBe(false);
    expect(passwordChangeBlocksApi("/api/auth/session", true)).toBe(false);
    expect(passwordChangeBlocksApi("/api/auth/csrf", true)).toBe(false);
  });

  it("does not let look-alike paths slip through the exemption", () => {
    expect(passwordChangeBlocksApi("/api/account/change-password-now", true)).toBe(true);
    expect(passwordChangeBlocksApi("/api/account/change-password/extra", true)).toBe(true);
    expect(passwordChangeBlocksApi("/api/authx/steal", true)).toBe(true);
    expect(passwordChangeBlocksApi("/api/account/change-password/", true)).toBe(false); // trailing slash is the same route
  });

  it("blocks nothing for users who do not have to change their password, or for pages", () => {
    expect(passwordChangeBlocksApi("/api/tests/IQ/start", false)).toBe(false);
    expect(passwordChangeBlocksApi("/api/tests/IQ/start", undefined)).toBe(false);
    expect(passwordChangeBlocksApi("/candidate", true)).toBe(false); // pages redirect instead
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
  });
});

describe("the shared guard is wired into the proxy", () => {
  const authorized = authConfig.callbacks.authorized as (args: unknown) => unknown;
  const call = (pathname: string, user: unknown) =>
    authorized({ auth: user ? { user } : null, request: { nextUrl: new URL(`http://localhost${pathname}`) } });

  it("answers 403 PASSWORD_CHANGE_REQUIRED on an API route", async () => {
    const res = (await call("/api/tests/IQ/start", { id: "u", role: "CANDIDATE", mustChangePassword: true })) as Response;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(PASSWORD_CHANGE_REQUIRED_BODY);
  });

  it("lets the exempt routes, normal users and signed-out callers through", async () => {
    expect(await call("/api/account/change-password", { id: "u", role: "CANDIDATE", mustChangePassword: true })).toBe(true);
    expect(await call("/api/auth/signout", { id: "u", role: "CANDIDATE", mustChangePassword: true })).toBe(true);
    expect(await call("/api/tests/IQ/start", { id: "u", role: "CANDIDATE", mustChangePassword: false })).toBe(true);
    expect(await call("/api/signup/candidate", null)).toBe(true);
  });

  it("runs the proxy on every API route", () => {
    const src = readFileSync("src/proxy.ts", "utf8");
    expect(src).toContain('"/api/:path*"');
  });

  it("covers every route file under src/app/api (nothing can opt out by being added later)", () => {
    const routes = globSync("src/app/api/**/route.ts");
    expect(routes.length).toBeGreaterThan(20);
    for (const file of routes) {
      const path = "/" + file.split("\\").join("/").replace("src/app/", "").replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "x");
      const exempt = path === "/api/account/change-password" || path.startsWith("/api/auth/");
      expect(passwordChangeBlocksApi(path, true), path).toBe(!exempt);
    }
  });
});
