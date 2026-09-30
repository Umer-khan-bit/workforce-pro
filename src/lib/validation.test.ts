import { describe, expect, it } from "vitest";
import {
  candidateSignupSchema,
  companySignupSchema,
  recruiterCreateSchema,
  changePasswordSchema,
} from "./validation";

const validCandidate = {
  name: "Ayesha Khan",
  email: "ayesha@example.com",
  password: "supersecret1",
  phone: "03001234567",
  city: "Lahore",
  regionId: "region-1",
  experienceYears: 3,
  jobRoleId: "role-1",
  minimumSalary: 50000,
  consentGiven: true,
};

describe("candidateSignupSchema", () => {
  it("accepts a fully valid payload", () => {
    expect(candidateSignupSchema.safeParse(validCandidate).success).toBe(true);
  });

  it("rejects when consent is not given", () => {
    const result = candidateSignupSchema.safeParse({ ...validCandidate, consentGiven: false });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = candidateSignupSchema.safeParse({ ...validCandidate, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = candidateSignupSchema.safeParse({ ...validCandidate, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects missing region or job role", () => {
    expect(candidateSignupSchema.safeParse({ ...validCandidate, regionId: "" }).success).toBe(false);
    expect(candidateSignupSchema.safeParse({ ...validCandidate, jobRoleId: "" }).success).toBe(false);
  });

  it("rejects negative experience or salary", () => {
    expect(
      candidateSignupSchema.safeParse({ ...validCandidate, experienceYears: -1 }).success
    ).toBe(false);
    expect(
      candidateSignupSchema.safeParse({ ...validCandidate, minimumSalary: -1 }).success
    ).toBe(false);
  });

  it("coerces numeric strings from form data", () => {
    const result = candidateSignupSchema.safeParse({
      ...validCandidate,
      experienceYears: "3",
      minimumSalary: "50000",
    });
    expect(result.success).toBe(true);
  });
});

describe("companySignupSchema", () => {
  const validCompany = {
    companyName: "Acme Recruiting",
    industry: "Retail",
    city: "Karachi",
    adminName: "Bilal Ahmed",
    adminEmail: "bilal@acme.com",
    adminPassword: "supersecret1",
  };

  it("accepts a fully valid payload", () => {
    expect(companySignupSchema.safeParse(validCompany).success).toBe(true);
  });

  it("accepts optional industry/city being omitted", () => {
    const { industry, city, ...rest } = validCompany;
    expect(companySignupSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects a short admin password", () => {
    const result = companySignupSchema.safeParse({ ...validCompany, adminPassword: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid admin email", () => {
    const result = companySignupSchema.safeParse({ ...validCompany, adminEmail: "nope" });
    expect(result.success).toBe(false);
  });
});

describe("recruiterCreateSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      recruiterCreateSchema.safeParse({ name: "Sana Malik", email: "sana@acme.com" }).success
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      recruiterCreateSchema.safeParse({ name: "Sana Malik", email: "nope" }).success
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "temp123", newPassword: "newpassword1" })
        .success
    ).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "temp123", newPassword: "short" }).success
    ).toBe(false);
  });
});
