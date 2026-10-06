import { describe, expect, it } from "vitest";
import { aiSearchExample } from "./aiSearchExample";

describe("AI search example sentence", () => {
  it("uses the role and the city it is given", () => {
    expect(aiSearchExample("Pilot", "Quetta")).toBe("Pilot candidates in Quetta with at least 3 years of experience and strong IQ");
  });
  it("copes with a missing role or city, and with neither", () => {
    expect(aiSearchExample("Pilot", null)).toBe("Pilot candidates with at least 3 years of experience and strong IQ");
    expect(aiSearchExample(undefined, "Quetta")).toBe("candidates in Quetta with at least 3 years of experience and strong IQ");
    expect(aiSearchExample("  ", "")).toBe("candidates with at least 3 years of experience and strong IQ");
  });
});
