import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { REFERENCE_SCHEMAS, RuleError, deleteReference, updateReference } from "./entities";
import { testConfigSchema } from "../testConfig";
import { planCreateSchema } from "../plans";

describe("reference data validation", () => {
  it("experience bands: maximum cannot be below minimum, open-ended is allowed", () => {
    const s = REFERENCE_SCHEMAS["experience-bands"];
    expect(s.safeParse({ label: "2-4 years", minYears: 2, maxYears: 4, sortOrder: 2 }).success).toBe(true);
    expect(s.safeParse({ label: "10+ years", minYears: 10, maxYears: null, sortOrder: 4 }).success).toBe(true);
    expect(s.safeParse({ label: "bad", minYears: 5, maxYears: 2, sortOrder: 1 }).success).toBe(false);
  });

  it("salary benchmarks: minimum <= average <= maximum", () => {
    const s = REFERENCE_SCHEMAS["salary-benchmarks"];
    const row = { jobRoleId: "r", city: "Lahore", experienceBandId: "b", minSalary: 40000, avgSalary: 50000, maxSalary: 65000 };
    expect(s.safeParse(row).success).toBe(true);
    expect(s.safeParse({ ...row, avgSalary: 30000 }).success).toBe(false);
    expect(s.safeParse({ ...row, maxSalary: 45000 }).success).toBe(false);
    expect(s.safeParse({ ...row, minSalary: -1 }).success).toBe(false);
  });

  it("languages need a sensible code; cities need a region; names cannot be blank", () => {
    expect(REFERENCE_SCHEMAS.languages.safeParse({ name: "Sindhi", code: "SD", isActive: true, isDefault: false, isRtl: true }).success).toBe(true);
    expect(REFERENCE_SCHEMAS.languages.safeParse({ name: "X", code: "not a code!", isActive: true, isDefault: false, isRtl: false }).success).toBe(false);
    expect(REFERENCE_SCHEMAS.cities.safeParse({ name: "Kasur", regionId: "", isActive: true }).success).toBe(false);
    expect(REFERENCE_SCHEMAS.regions.safeParse({ name: "  ", isActive: true }).success).toBe(false);
  });
});

describe("language rules", () => {
  const prisma = (current: unknown) =>
    ({ language: { findUnique: vi.fn().mockResolvedValue(current), delete: vi.fn() } }) as unknown as PrismaClient;

  it("cannot un-default the default language without choosing another", async () => {
    await expect(
      updateReference(prisma({ isDefault: true }), "languages", "l1", { name: "English", code: "en", isActive: true, isDefault: false, isRtl: false })
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("the default language must stay active", async () => {
    await expect(
      updateReference(prisma(null), "languages", "l1", { name: "English", code: "en", isActive: false, isDefault: true, isRtl: false })
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("cannot delete the default language", async () => {
    await expect(deleteReference(prisma({ isDefault: true }), "languages", "l1")).rejects.toBeInstanceOf(RuleError);
  });
});

describe("test settings validation", () => {
  const ok = { minItems: 10, maxItems: 20, seThreshold: 0.35, timeLimitMinutes: 15, retakeWaitingDays: 30, pretestItemCount: 2 };

  it("accepts sensible values", () => {
    expect(testConfigSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects min above max, pretest above max, and out-of-range values", () => {
    expect(testConfigSchema.safeParse({ ...ok, minItems: 25 }).success).toBe(false);
    expect(testConfigSchema.safeParse({ ...ok, pretestItemCount: 21 }).success).toBe(false);
    expect(testConfigSchema.safeParse({ ...ok, seThreshold: 0 }).success).toBe(false);
    expect(testConfigSchema.safeParse({ ...ok, timeLimitMinutes: 0 }).success).toBe(false);
    expect(testConfigSchema.safeParse({ ...ok, retakeWaitingDays: -1 }).success).toBe(false);
  });
});

describe("plan validation", () => {
  const ok = { code: "Enterprise", name: "Enterprise", priceMonthly: 90000, isActive: true, sortOrder: 3, features: {} };

  it("normalises the code and accepts a new plan", () => {
    const r = planCreateSchema.safeParse(ok);
    expect(r.success && r.data.code).toBe("enterprise");
  });

  it("rejects bad codes, names and negative prices", () => {
    expect(planCreateSchema.safeParse({ ...ok, code: "a" }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...ok, code: "has space" }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...ok, priceMonthly: -5 }).success).toBe(false);
  });
});
