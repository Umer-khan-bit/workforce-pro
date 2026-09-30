import { test, expect } from "@playwright/test";
import { randomIp } from "./helpers";

// Invalid bodies are rejected with 400 before touching the database, so this
// exercises the limiter without creating accounts.
for (const endpoint of ["/api/signup/candidate", "/api/signup/company"]) {
  test(`${endpoint} is rate limited per client IP`, async ({ request }) => {
    const headers = { "x-forwarded-for": randomIp() };

    for (let i = 0; i < 5; i++) {
      const res = await request.post(endpoint, { data: {}, headers });
      expect(res.status()).toBe(400);
    }

    const blocked = await request.post(endpoint, { data: {}, headers });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()["retry-after"]).toBe("900");

    const otherClient = await request.post(endpoint, {
      data: {},
      headers: { "x-forwarded-for": randomIp() },
    });
    expect(otherClient.status()).toBe(400);
  });
}
