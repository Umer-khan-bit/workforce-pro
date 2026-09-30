import { describe, expect, it } from "vitest";
import { buildQuestionWhere, coverageLevel } from "./queries";
import { listFiltersSchema } from "./schema";

const filters = (over: object = {}) => listFiltersSchema.parse(over);

describe("buildQuestionWhere", () => {
  it("has no conditions when nothing is filtered", () => {
    expect(buildQuestionWhere(filters())).toEqual({});
  });

  it("combines search, test type, role, language, difficulty and a real status", () => {
    const where = buildQuestionWhere(
      filters({ q: "budget", testType: "SKILL", jobRoleId: "r1", languageId: "l1", difficulty: "HARD", status: "RETIRED" })
    );
    expect(where).toMatchObject({
      testType: "SKILL",
      jobRoleId: "r1",
      languageId: "l1",
      difficulty: "HARD",
      status: "RETIRED",
    });
    expect(where.OR).toHaveLength(2);
  });

  it("treats Flagged as the item-statistics marker, not a status", () => {
    const where = buildQuestionWhere(filters({ status: "FLAGGED" }));
    expect(where.status).toBeUndefined();
    expect(where.itemStatistic).toEqual({ is: { flagged: true } });
  });
});

describe("coverageLevel", () => {
  it("flags none as a gap, below target as low, at or above target as ok", () => {
    expect(coverageLevel(0, 40)).toBe("gap");
    expect(coverageLevel(39, 40)).toBe("low");
    expect(coverageLevel(40, 40)).toBe("ok");
  });
});
