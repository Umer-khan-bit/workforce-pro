import { describe, expect, it } from "vitest";
import { PRIVACY_POLICY_SEED, PRIVACY_POLICY_UPDATES } from "./seedData";

describe("privacy policy versions", () => {
  it("form one unbroken chain starting from the first version", () => {
    let previous = PRIVACY_POLICY_SEED.version;
    for (const update of PRIVACY_POLICY_UPDATES) {
      expect(update.previousVersion).toBe(previous);
      previous = update.version;
    }
  });

  it("says that gender is optional and only used for fairness checks (version 1.2)", () => {
    const v12 = PRIVACY_POLICY_UPDATES.find((u) => u.version === "1.2");
    expect(v12?.paragraph).toMatch(/Gender is optional/);
    expect(v12?.paragraph).toMatch(/fairness checks/);
    expect(v12?.paragraph).toMatch(/never shown to recruiters/);
  });
});
