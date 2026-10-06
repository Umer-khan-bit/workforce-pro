import { describe, expect, it } from "vitest";
import { parsePeriodChoices, validPeriodChoices } from "./periods";

describe("report period choices", () => {
  it("reads a comma separated list, sorted and without repeats", () => {
    expect(parsePeriodChoices("90, 30,180 ,30, 365")).toEqual([30, 90, 180, 365]);
  });
  it("leaves out anything that is not a whole number of days from 1 to 730", () => {
    expect(parsePeriodChoices("30, abc, 0, 1000, 12.5, 7")).toEqual([7, 30]);
  });
  it("accepts one to eight clean choices and nothing else", () => {
    expect(validPeriodChoices("30, 90")).toBe(true);
    expect(validPeriodChoices("")).toBe(false);
    expect(validPeriodChoices("30, x")).toBe(false);
    expect(validPeriodChoices("1,2,3,4,5,6,7,8,9")).toBe(false);
  });
});
