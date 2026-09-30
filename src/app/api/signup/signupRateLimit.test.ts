import { beforeEach, describe, expect, it, vi } from "vitest";

// Invalid bodies are rejected before any DB access, so a stub client is enough
// to prove the limiter sits in front of each endpoint.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { POST as candidateSignup } from "./candidate/route";
import { POST as companySignup } from "./company/route";
import { AUTH_ATTEMPT_LIMIT } from "@/lib/rateLimit";

function signupRequest(url: string, ip: string) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({}),
  });
}

let ip: string;
beforeEach(() => {
  ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
});

describe.each([
  ["candidate", "/api/signup/candidate", candidateSignup],
  ["company", "/api/signup/company", companySignup],
] as const)("%s signup rate limit", (_name, url, handler) => {
  it(`allows ${AUTH_ATTEMPT_LIMIT} attempts then returns 429 with Retry-After`, async () => {
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) {
      const res = await handler(signupRequest(url, ip));
      expect(res.status).toBe(400);
    }
    const blocked = await handler(signupRequest(url, ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");
  });

  it("limits each client IP separately", async () => {
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) await handler(signupRequest(url, ip));
    expect((await handler(signupRequest(url, ip))).status).toBe(429);
    expect((await handler(signupRequest(url, `${ip}9`))).status).toBe(400);
  });
});

it("counts the two endpoints independently for the same IP", async () => {
  for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) {
    await candidateSignup(signupRequest("/api/signup/candidate", ip));
  }
  expect((await candidateSignup(signupRequest("/api/signup/candidate", ip))).status).toBe(429);
  expect((await companySignup(signupRequest("/api/signup/company", ip))).status).toBe(400);
});
