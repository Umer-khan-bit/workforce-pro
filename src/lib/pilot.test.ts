import { describe, expect, it } from "vitest";
import { pilotBlocksCompany, pilotBlocksUser } from "./pilot";

describe("pilot mode rules", () => {
  const on = { enabled: true, companyId: "c1" };
  it("does nothing when it is off", () => {
    expect(pilotBlocksUser({ enabled: false, companyId: "c1" }, { role: "RECRUITER", companyId: "c2" })).toBe(false);
    expect(pilotBlocksCompany({ enabled: false, companyId: null }, "c2")).toBe(false);
  });
  it("blocks recruiters and company admins of other companies, not the pilot company", () => {
    expect(pilotBlocksUser(on, { role: "RECRUITER", companyId: "c2" })).toBe(true);
    expect(pilotBlocksUser(on, { role: "COMPANY_ADMIN", companyId: "c2" })).toBe(true);
    expect(pilotBlocksUser(on, { role: "RECRUITER", companyId: "c1" })).toBe(false);
  });
  it("never blocks candidates or platform admins", () => {
    expect(pilotBlocksUser(on, { role: "CANDIDATE", companyId: null })).toBe(false);
    expect(pilotBlocksUser(on, { role: "PLATFORM_ADMIN", companyId: null })).toBe(false);
  });
  it("a pilot switched on with no company blocks every company", () => {
    expect(pilotBlocksCompany({ enabled: true, companyId: null }, "c1")).toBe(true);
    expect(pilotBlocksCompany(on, "c1")).toBe(false);
    expect(pilotBlocksCompany(on, "c2")).toBe(true);
  });
});
