import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateTempPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against the hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("generates a reasonably long, URL-safe string", () => {
    const password = generateTempPassword();
    expect(password.length).toBeGreaterThanOrEqual(10);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates different passwords each time", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });
});
