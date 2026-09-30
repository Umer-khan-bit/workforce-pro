import { describe, expect, it } from "vitest";
import { TEMPLATE_SEEDS, renderTemplate, unknownPlaceholders } from "./messageTemplates";

describe("message templates", () => {
  it("keys are unique and the seeded wording only uses its own placeholders", () => {
    expect(new Set(TEMPLATE_SEEDS.map((t) => t.key)).size).toBe(TEMPLATE_SEEDS.length);
    for (const t of TEMPLATE_SEEDS) {
      expect(unknownPlaceholders(`${t.subject} ${t.body}`, t.variables), t.key).toEqual([]);
    }
  });

  it("includes the top-performer email and the recruiter request alerts", () => {
    const keys = TEMPLATE_SEEDS.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["TOP_PERFORMER_EMAIL", "CONTACT_REQUEST_RECEIVED_EMAIL", "CONTACT_REQUEST_ACCEPTED_IN_APP"]));
  });

  it("finds placeholders that are not allowed", () => {
    expect(unknownPlaceholders("Hi {{name}} {{ oops }}", ["name"])).toEqual(["oops"]);
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(renderTemplate("Hello {{candidateName}} from {{brandName}} {{missing}}", { candidateName: "Sana", brandName: "Acme" })).toBe(
      "Hello Sana from Acme {{missing}}"
    );
  });
});
