import { describe, expect, it, vi } from "vitest";

// Invalid bodies are rejected before any DB access, so a stub client is enough
// to prove the limiter sits in front of the endpoint.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const session = vi.hoisted(() => ({ userId: "user-a" as string | null }));
vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));

import { POST } from "./change-password/route";
import { AUTH_ATTEMPT_LIMIT } from "@/lib/rateLimit";

const call = () =>
  POST(
    new Request("http://localhost/api/account/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
  );

describe("change-password rate limit", () => {
  it("rejects anonymous callers without spending an attempt", async () => {
    session.userId = null;
    expect((await call()).status).toBe(401);
  });

  it(`allows ${AUTH_ATTEMPT_LIMIT} attempts, then 429 with Retry-After, per user`, async () => {
    session.userId = "user-a";
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) expect((await call()).status).toBe(400);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");

    session.userId = "user-b";
    expect((await call()).status).toBe(400);
  });
});
