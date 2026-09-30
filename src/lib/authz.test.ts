import { describe, expect, it } from "vitest";
import { getAllowedRoles, isRoleAllowed, ROLE_HOME_PATH } from "./authz";
import type { Role } from "@prisma/client";

const ALL_ROLES: Role[] = ["CANDIDATE", "RECRUITER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];

describe("getAllowedRoles", () => {
  it("returns null for public paths", () => {
    expect(getAllowedRoles("/")).toBeNull();
    expect(getAllowedRoles("/login")).toBeNull();
    expect(getAllowedRoles("/signup")).toBeNull();
    expect(getAllowedRoles("/signup/company")).toBeNull();
    expect(getAllowedRoles("/privacy")).toBeNull();
    expect(getAllowedRoles("/unauthorized")).toBeNull();
  });

  it("restricts /candidate to CANDIDATE only", () => {
    expect(getAllowedRoles("/candidate")).toEqual(["CANDIDATE"]);
    expect(getAllowedRoles("/candidate/results")).toEqual(["CANDIDATE"]);
  });

  it("restricts /recruiter to RECRUITER only", () => {
    expect(getAllowedRoles("/recruiter")).toEqual(["RECRUITER"]);
    expect(getAllowedRoles("/recruiter/search")).toEqual(["RECRUITER"]);
  });

  it("restricts /company-admin to COMPANY_ADMIN only", () => {
    expect(getAllowedRoles("/company-admin")).toEqual(["COMPANY_ADMIN"]);
    expect(getAllowedRoles("/company-admin/recruiters")).toEqual(["COMPANY_ADMIN"]);
  });

  it("restricts /admin to PLATFORM_ADMIN only", () => {
    expect(getAllowedRoles("/admin")).toEqual(["PLATFORM_ADMIN"]);
    expect(getAllowedRoles("/admin/questions")).toEqual(["PLATFORM_ADMIN"]);
  });

  it("does not treat a path with a shared prefix as protected", () => {
    // e.g. "/admins-guide" should not match "/admin"
    expect(getAllowedRoles("/admins-guide")).toBeNull();
    expect(getAllowedRoles("/candidates-list")).toBeNull();
  });
});

describe("isRoleAllowed", () => {
  const protectedPaths = ["/candidate", "/recruiter", "/company-admin", "/admin"];

  it("allows every role on unprotected paths", () => {
    for (const role of ALL_ROLES) {
      expect(isRoleAllowed("/", role)).toBe(true);
      expect(isRoleAllowed("/login", role)).toBe(true);
    }
  });

  it("only allows the matching role on each protected path, and denies every other role", () => {
    const expected: Record<string, Role> = {
      "/candidate": "CANDIDATE",
      "/recruiter": "RECRUITER",
      "/company-admin": "COMPANY_ADMIN",
      "/admin": "PLATFORM_ADMIN",
    };

    for (const path of protectedPaths) {
      for (const role of ALL_ROLES) {
        expect(isRoleAllowed(path, role)).toBe(role === expected[path]);
      }
    }
  });
});

describe("ROLE_HOME_PATH", () => {
  it("maps every role to a path it is itself allowed to access", () => {
    for (const role of ALL_ROLES) {
      const home = ROLE_HOME_PATH[role];
      expect(isRoleAllowed(home, role)).toBe(true);
    }
  });
});
