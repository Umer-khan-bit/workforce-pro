import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { isRateLimited, type RateLimitDb } from "./rateLimit";

/** In-memory stand-in for the database, just enough for the limiter's transaction. */
function fakeDb() {
  const hits: Array<{ key: string; createdAt: Date }> = [];
  const tx = {
    $executeRaw: async () => 0,
    rateLimitHit: {
      count: async ({ where }: { where: { key: string; createdAt: { gt: Date } } }) =>
        hits.filter((h) => h.key === where.key && h.createdAt > where.createdAt.gt).length,
      create: async ({ data }: { data: { key: string; createdAt: Date } }) => {
        hits.push(data);
        return data;
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as RateLimitDb;
  return { db, hits };
}

describe("isRateLimited (logic)", () => {
  it("allows attempts up to the limit, then blocks without recording more", async () => {
    const { db, hits } = fakeDb();
    for (let i = 0; i < 5; i++) expect(await isRateLimited("k", 5, 60_000, db)).toBe(false);
    expect(await isRateLimited("k", 5, 60_000, db)).toBe(true);
    expect(hits).toHaveLength(5);
  });

  it("tracks separate keys independently", async () => {
    const { db } = fakeDb();
    for (let i = 0; i < 3; i++) await isRateLimited("a", 3, 60_000, db);
    expect(await isRateLimited("a", 3, 60_000, db)).toBe(true);
    expect(await isRateLimited("b", 3, 60_000, db)).toBe(false);
  });

  it("forgets attempts that are older than the window", async () => {
    const { db, hits } = fakeDb();
    hits.push({ key: "k", createdAt: new Date(Date.now() - 120_000) });
    hits.push({ key: "k", createdAt: new Date(Date.now() - 90_000) });
    expect(await isRateLimited("k", 2, 60_000, db)).toBe(false);
    expect(await isRateLimited("k", 2, 60_000, db)).toBe(false);
    expect(await isRateLimited("k", 2, 60_000, db)).toBe(true);
  });
});

// ---------- real database: proves the limit survives a restart and is shared between servers ----------

async function canConnect(client: PrismaClient) {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const serverA = new PrismaClient();
const dbUp = await canConnect(serverA);
const run = `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!dbUp)("isRateLimited (real database)", () => {
  afterAll(async () => {
    await serverA.rateLimitHit.deleteMany({ where: { key: { contains: run } } });
    await serverA.$disconnect();
  });

  it("is shared between two servers using the same database (separate connections)", async () => {
    const serverB = new PrismaClient();
    try {
      const key = `shared:${run}`;
      expect(await isRateLimited(key, 3, 60_000, serverA)).toBe(false);
      expect(await isRateLimited(key, 3, 60_000, serverB)).toBe(false);
      expect(await isRateLimited(key, 3, 60_000, serverA)).toBe(false);
      // Both servers now see the limit as reached.
      expect(await isRateLimited(key, 3, 60_000, serverB)).toBe(true);
      expect(await isRateLimited(key, 3, 60_000, serverA)).toBe(true);
    } finally {
      await serverB.$disconnect();
    }
  });

  it("survives a restart: a brand-new client still sees earlier attempts", async () => {
    const key = `restart:${run}`;
    for (let i = 0; i < 2; i++) expect(await isRateLimited(key, 2, 60_000, serverA)).toBe(false);

    const afterRestart = new PrismaClient(); // a new process would start with an empty memory, but the same database
    try {
      expect(await isRateLimited(key, 2, 60_000, afterRestart)).toBe(true);
    } finally {
      await afterRestart.$disconnect();
    }
  });

  it("cannot be beaten by requests arriving at the same moment", async () => {
    const key = `parallel:${run}`;
    const results = await Promise.all(Array.from({ length: 12 }, () => isRateLimited(key, 4, 60_000, serverA)));
    expect(results.filter((limited) => !limited)).toHaveLength(4);
  });

  it("lets attempts through again once they fall outside the window", async () => {
    const key = `window:${run}`;
    await serverA.rateLimitHit.create({ data: { key, createdAt: new Date(Date.now() - 10 * 60_000) } });
    await serverA.rateLimitHit.create({ data: { key, createdAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await isRateLimited(key, 2, 60_000, serverA)).toBe(false);
  });
});
