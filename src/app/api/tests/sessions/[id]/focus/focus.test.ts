import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { POST as start } from "../../../[testType]/start/route";
import { POST as focus } from "./route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!dbUp)("focus-lost route (real database)", () => {
  let kit: Kit;
  const userIds: string[] = [];
  beforeAll(async () => {
    kit = await createKit(prisma, "focus");
    await kit.addCatBank("IQ", 30, 2);
  }, 60_000);
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.rateLimitHit.deleteMany({ where: { OR: userIds.flatMap((u) => [{ key: `focus:${u}` }, { key: `tests:${u}` }]) } });
    await kit.cleanup();
  }, 60_000);

  async function candidateWithSession(name: string) {
    const c = await kit.addCandidate(name);
    userIds.push(c.userId);
    session.user = { id: c.userId, role: "CANDIDATE" };
    const { sessionId } = await (await start(json({}), { params: Promise.resolve({ testType: "IQ" }) })).json();
    return { ...c, sessionId };
  }

  it("rejects anyone who is not a signed-in candidate", async () => {
    session.user = null;
    expect((await focus(json({}), ctx("x"))).status).toBe(403);
    session.user = { id: "someone", role: "RECRUITER" };
    expect((await focus(json({}), ctx("x"))).status).toBe(403);
  });

  it("records each leave with the session id, test type and a running count, and nothing else", async () => {
    const c = await candidateWithSession("leaver");
    expect(await (await focus(json({ source: "hidden" }), ctx(c.sessionId))).json()).toEqual({ count: 1 });
    expect(await (await focus(json({ source: "blur" }), ctx(c.sessionId))).json()).toEqual({ count: 2 });
    const rows = await prisma.auditLog.findMany({ where: { action: "TEST_FOCUS_LOST", targetId: c.sessionId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.metadata)).toEqual([
      { testType: "IQ", count: 1 },
      { testType: "IQ", count: 2 },
    ]);
    expect(rows[0]).toMatchObject({ actorId: c.userId, targetType: "TestSession" });
    // The test itself is untouched.
    expect((await prisma.testSession.findUnique({ where: { id: c.sessionId } }))?.status).toBe("IN_PROGRESS");
  });

  it("only works on the candidate's own running session", async () => {
    const owner = await candidateWithSession("owner");
    const other = await kit.addCandidate("intruder");
    userIds.push(other.userId);
    session.user = { id: other.userId, role: "CANDIDATE" };
    expect((await focus(json({}), ctx(owner.sessionId))).status).toBe(404);
    expect((await focus(json({}), ctx("does-not-exist"))).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "TEST_FOCUS_LOST", targetId: owner.sessionId } })).toBe(0);

    session.user = { id: owner.userId, role: "CANDIDATE" };
    await prisma.testSession.update({ where: { id: owner.sessionId }, data: { status: "COMPLETED" } });
    expect((await focus(json({}), ctx(owner.sessionId))).status).toBe(404);
  });

  it("rejects an invalid body", async () => {
    const c = await candidateWithSession("badbody");
    expect((await focus(json({ source: "something else" }), ctx(c.sessionId))).status).toBe(400);
  });

  it("is rate limited", async () => {
    const c = await candidateWithSession("spammer");
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await focus(json({}), ctx(c.sessionId))).status;
    expect(last).toBe(429);
    expect(await prisma.auditLog.count({ where: { action: "TEST_FOCUS_LOST", targetId: c.sessionId } })).toBe(30);
  });
});
