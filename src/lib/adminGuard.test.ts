import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

import { requirePlatformAdmin } from "./adminGuard";

describe("requirePlatformAdmin", () => {
  beforeEach(() => authMock.mockReset());

  it("returns the admin's id for a platform admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "PLATFORM_ADMIN" } });
    expect(await requirePlatformAdmin()).toEqual({ userId: "u1" });
  });

  it.each(["CANDIDATE", "RECRUITER", "COMPANY_ADMIN"])("rejects a %s with 403", async (role) => {
    authMock.mockResolvedValue({ user: { id: "u2", role } });
    const result = await requirePlatformAdmin();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("rejects a signed-out request with 403", async () => {
    authMock.mockResolvedValue(null);
    const result = await requirePlatformAdmin();
    expect((result as Response).status).toBe(403);
  });
});
