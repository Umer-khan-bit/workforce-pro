import { describe, expect, it } from "vitest";
import { isRateLimited } from "./rateLimit";

describe("isRateLimited", () => {
  it("allows attempts up to the limit, then blocks", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 5, 60_000)).toBe(false);
    }
    expect(isRateLimited(key, 5, 60_000)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;

    for (let i = 0; i < 3; i++) isRateLimited(keyA, 3, 60_000);

    expect(isRateLimited(keyA, 3, 60_000)).toBe(true);
    expect(isRateLimited(keyB, 3, 60_000)).toBe(false);
  });
});
