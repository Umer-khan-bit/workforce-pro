import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { isDemoMode, seedDemoData } from "./seedDemo";

describe("demo mode guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on only for the exact string 'true'", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(isDemoMode({ DEMO_MODE: value })).toBe(false);
    }
  });

  it("creates no accounts (demo.admin included) unless DEMO_MODE is 'true'", async () => {
    // Any database call would throw on this proxy, which is the point: nothing may be touched.
    const untouchable = new Proxy({}, { get: () => { throw new Error("database was touched"); } });

    for (const value of ["false", ""]) {
      vi.stubEnv("DEMO_MODE", value);
      await expect(
        seedDemoData(untouchable as unknown as PrismaClient, { jobRoles: [], regions: [] })
      ).rejects.toThrow(/DEMO_MODE/);
    }
  });
});
