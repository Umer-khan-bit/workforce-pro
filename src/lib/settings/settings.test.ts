import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_SETTINGS,
  SETTING_GROUPS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  brandingSchema,
  itemDefaultsSchema,
  quartilesSchema,
  selfLearningSchema,
  topPerformerSchema,
} from "./definitions";
import { readSetting, seedSettings } from "./store";
import { BRAND_SHADES, brandCss, generateBrandShades } from "./brandColor";
import { formatMoney } from "../money";

describe("settings definitions", () => {
  it("every starting value passes its own validation", () => {
    for (const key of SETTING_KEYS) {
      const result = SETTING_SCHEMAS[key].safeParse(DEFAULT_SETTINGS[key]);
      expect(result.success, key).toBe(true);
    }
  });

  it("has an admin form group for every setting, covering every field", () => {
    expect(SETTING_GROUPS.map((g) => g.key).sort()).toEqual([...SETTING_KEYS].sort());
    for (const g of SETTING_GROUPS) {
      const fields = g.fields.map((f) => f.name).sort();
      expect(fields, g.key).toEqual(Object.keys(DEFAULT_SETTINGS[g.key]).sort());
    }
  });

  it("quartile cut-offs must rise from Q1 to Q3", () => {
    const ok = { q1TopPercent: 25, q2TopPercent: 50, q3TopPercent: 75, minCohortSize: 30 };
    expect(quartilesSchema.safeParse(ok).success).toBe(true);
    expect(quartilesSchema.safeParse({ ...ok, q2TopPercent: 20 }).success).toBe(false);
    expect(quartilesSchema.safeParse({ ...ok, minCohortSize: 0 }).success).toBe(false);
  });

  it("top-performer rule needs at least one test and a real quartile", () => {
    expect(topPerformerSchema.safeParse({ requiredQuartile: 1, countedTests: [] }).success).toBe(false);
    expect(topPerformerSchema.safeParse({ requiredQuartile: 5, countedTests: ["IQ"] }).success).toBe(false);
    expect(topPerformerSchema.safeParse({ requiredQuartile: 2, countedTests: ["IQ", "SKILL"] }).success).toBe(true);
  });

  it("item defaults keep Easy < Medium < Hard; self-learning keeps hard-rate < easy-rate", () => {
    expect(itemDefaultsSchema.safeParse({ discrimination: 1, difficultyEasy: 1, difficultyMedium: 0, difficultyHard: 1 }).success).toBe(false);
    const sl = DEFAULT_SETTINGS.selfLearning;
    expect(selfLearningSchema.safeParse({ ...sl, tooHardCorrectRate: 0.95 }).success).toBe(false);
  });

  it("branding accepts a hex colour and small image logos only", () => {
    const b = DEFAULT_SETTINGS.branding;
    expect(brandingSchema.safeParse({ ...b, primaryColor: "red" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...b, name: " " }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...b, logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" }).success).toBe(true);
    // Scripts and other document types are never accepted as a logo.
    expect(brandingSchema.safeParse({ ...b, logoDataUrl: "data:text/html;base64,PHNjcmlwdD4=" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...b, logoDataUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...b, logoDataUrl: `data:image/png;base64,${"A".repeat(200_001)}` }).success).toBe(false);
  });
});

describe("readSetting / seedSettings", () => {
  const db = (row: unknown) =>
    ({
      siteSetting: {
        findUnique: vi.fn().mockResolvedValue(row),
        create: vi.fn().mockResolvedValue({}),
      },
    }) as unknown as Pick<PrismaClient, "siteSetting">;

  it("returns the starting values when nothing is saved", async () => {
    expect(await readSetting(db(null), "currency")).toEqual(DEFAULT_SETTINGS.currency);
  });

  it("lays saved values over the starting values", async () => {
    const value = await readSetting(db({ value: { code: "USD" } }), "currency");
    expect(value).toEqual({ code: "USD", locale: DEFAULT_SETTINGS.currency.locale });
  });

  it("falls back to the starting values when a saved row is invalid", async () => {
    expect(await readSetting(db({ value: { primaryColor: "nope" } }), "branding")).toEqual(DEFAULT_SETTINGS.branding);
  });

  it("the seed only creates groups that are missing", async () => {
    const existing = db({ value: {} });
    expect(await seedSettings(existing)).toBe(0);
    expect(existing.siteSetting.create).not.toHaveBeenCalled();

    const empty = db(null);
    expect(await seedSettings(empty)).toBe(SETTING_KEYS.length);
  });
});

describe("brand colour shades", () => {
  it("uses the picked colour as shade 700 and returns ten valid shades", () => {
    const shades = generateBrandShades("#1c6560");
    expect(shades["700"]).toBe("#1c6560");
    expect(BRAND_SHADES.every((s) => /^#[0-9a-f]{6}$/.test(shades[s]))).toBe(true);
  });

  it("gets lighter toward 50 and darker toward 900", () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const shades = generateBrandShades("#2255aa");
    const order = BRAND_SHADES.map((s) => lum(shades[s]));
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });

  it("builds CSS variables for every shade", () => {
    const css = brandCss("#2255aa");
    for (const s of BRAND_SHADES) expect(css).toContain(`--color-brand-${s}:`);
  });
});

describe("formatMoney", () => {
  it("uses the configured currency code and locale", () => {
    expect(formatMoney(15000, { code: "PKR", locale: "en-PK" })).toBe("PKR 15,000");
    expect(formatMoney(1500, { code: "USD", locale: "en-US" })).toBe("USD 1,500");
  });
});
