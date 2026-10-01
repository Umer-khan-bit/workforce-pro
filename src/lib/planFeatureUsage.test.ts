import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * Plan features are what a plan allows. Code must ask for a feature (`hasFeature`, `featureLimit`, or the
 * entitlements built on them), never look at a plan's name or code, so admins can add and change plans freely.
 */
const files = globSync("src/**/*.{ts,tsx}")
  .map((f) => f.split("\\").join("/"))
  .filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith("src/lib/recruiter/testWorld.ts") && f !== "src/lib/seedData.ts" && f !== "src/lib/settings/definitions.ts");

describe("plan features are checked by feature, never by plan name or code", () => {
  it("finds the source files to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no code compares a plan's name or code", () => {
    const comparison = /\bplan\w*\??\.(code|name)\s*[!=]==?/i;
    const offenders = files.filter((f) => comparison.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no code branches on the starting plans by name", () => {
    const named = /[!=]==?\s*["'](basic|advanced)["']|["'](basic|advanced)["']\s*[!=]==?/i;
    const offenders = files.filter((f) => named.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("recruiter-facing features read the plan through the entitlements", () => {
    const needs: Record<string, string[]> = {
      "src/lib/recruiter/search.ts": ["canSeeTopPerformers"],
      "src/lib/recruiter/shortlist.ts": ["canSearch", "canSeeTopPerformers", "shortlistLimit"],
      "src/lib/recruiter/openings.ts": ["openingLimit"],
      "src/lib/recruiter/contactRequests.ts": ["canSearch", "canSeeTopPerformers"],
      "src/lib/recruiter/candidateDetail.ts": ["canSearch", "canSeeTopPerformers"],
      "src/app/api/recruiter/ai-search/route.ts": ["canUseAiSearch"],
    };
    for (const [file, names] of Object.entries(needs)) {
      const source = readFileSync(file, "utf8");
      for (const name of names) expect(source, `${file} should use ${name}`).toContain(name);
    }
  });

  it("the entitlements only ever use hasFeature and featureLimit", () => {
    const source = readFileSync("src/lib/recruiter/entitlements.ts", "utf8");
    expect(source).toContain("hasFeature(");
    expect(source).toContain("featureLimit(");
    expect(source).not.toMatch(/\.plan\??\.(code|name)/);
  });
});
