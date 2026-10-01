import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * The minimum-salary rule only holds if recruiter-facing code cannot read candidates any other way.
 * This test fails when a page or API route for recruiters or company admins touches candidate profiles
 * without going through the shared rule in `candidateAccess.ts` / `contactRequests.ts`.
 */
const RECRUITER_FACING = ["src/app/recruiter/**/*.{ts,tsx}", "src/app/company-admin/**/*.{ts,tsx}", "src/app/api/recruiter/**/*.{ts,tsx}", "src/app/api/recruiters/**/*.{ts,tsx}"];
const SANCTIONED = ["recruiterVisibleWhere", "viewCandidateAsRecruiter", "createContactRequest"];

describe("recruiter-facing code reads candidates only through the salary rule", () => {
  const files = RECRUITER_FACING.flatMap((pattern) => globSync(pattern));

  it("finds the files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => f.split("\\").join("/")))("%s", (file) => {
    const source = readFileSync(file, "utf8");
    const readsCandidates = /candidateProfile|CandidateProfile/.test(source);
    if (!readsCandidates) return;
    expect(SANCTIONED.some((name) => source.includes(name)), `${file} reads candidate profiles without the shared minimum-salary rule`).toBe(true);
  });

  it("the admin-only candidate screens are not recruiter-facing (admins see everyone)", () => {
    expect(files.some((f) => f.split("\\").join("/").startsWith("src/app/admin/"))).toBe(false);
  });
});
