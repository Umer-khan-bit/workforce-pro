import { afterAll, describe, expect, it, vi } from "vitest";

// Invalid bodies are rejected before any other database access, so this proves the (database-backed)
// limiter sits in front of the endpoint. User ids are unique per run because attempts are stored.
const run = `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));

import { POST } from "./change-password/route";
import { AUTH_ATTEMPT_LIMIT } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

afterAll(async () => {
  await prisma.rateLimitHit.deleteMany({ where: { key: { contains: run } } });
});

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
    session.userId = `a-${run}`;
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++) expect((await call()).status).toBe(400);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");

    session.userId = `b-${run}`;
    expect((await call()).status).toBe(400);
  });
});
