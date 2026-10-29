import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings/definitions";
import { mayShuffle, parsePhrases, refersToOtherOptions } from "./optionShuffle";

const phrases = parsePhrases(DEFAULT_SETTINGS.testing.integrityNoShufflePhrases);
const opts = (...texts: string[]) => texts.map((text, i) => ({ key: "ABCDE"[i], text }));

describe("which questions must keep their option order", () => {
  it("reads one phrase per line and drops blanks and repeats", () => {
    expect(parsePhrases("  both \n\nboth\r\nneither\n")).toEqual(["both", "neither"]);
    expect(phrases.length).toBeGreaterThan(5);
  });

  it.each([
    ["all of the above", ["Paris", "London", "Berlin", "All of the above"]],
    ["none of the above", ["Paris", "London", "Berlin", "NONE OF THE ABOVE"]],
    ["both A and B", ["Paris", "London", "Berlin", "Both A and B"]],
    ["A and B", ["Paris", "London", "Berlin", "A and B"]],
    ["A or C", ["Paris", "London", "Berlin", "A or C"]],
    ["neither", ["Paris", "London", "Berlin", "Neither of them"]],
    ["only A", ["Paris", "London", "Berlin", "Only A is true"]],
    ["a letter reference", ["Paris", "London", "Berlin", "Option C is also right"]],
    ["answer letter", ["Paris", "London", "Berlin", "see answer B"]],
  ])("is never shuffled when an option says %s", (_name, texts) => {
    expect(refersToOtherOptions(opts(...texts), phrases)).toBe(true);
    expect(mayShuffle(opts(...texts), phrases)).toBe(false);
  });

  it("shuffles ordinary options, including ones that merely contain the letter A as a word or a name", () => {
    expect(mayShuffle(opts("Paris", "London", "Berlin", "Madrid"), phrases)).toBe(true);
    expect(mayShuffle(opts("A manager", "An engineer", "The owner", "Anna and Bob"), phrases)).toBe(true);
    expect(mayShuffle(opts("Raise the issue", "Ignore it", "Ask a colleague", "Wait and see"), phrases)).toBe(true);
  });

  it("a single option is never shuffled, and an empty list of phrases turns the rule off", () => {
    expect(mayShuffle(opts("Only one"), phrases)).toBe(false);
    expect(mayShuffle(opts("Paris", "London", "All of the above"), [])).toBe(true);
  });

  it("an admin can add their own phrase, for example in another language", () => {
    const custom = parsePhrases("اوپر دیے گئے سب");
    expect(mayShuffle(opts("a", "b", "اوپر دیے گئے سب درست ہیں"), custom)).toBe(false);
  });
});
