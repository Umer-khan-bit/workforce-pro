import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { POST as start } from "./[testType]/start/route";
import { GET as getSession } from "./sessions/[id]/route";
import { POST as answer } from "./sessions/[id]/answer/route";
import { POST as writing } from "./sessions/[id]/writing/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

describe.skipIf(!dbUp)("test API routes (real database)", () => {
  let kit: Kit;
  beforeAll(async () => {
    kit = await createKit(prisma, "routes");
    await kit.addCatBank("IQ", 30, 2);
  }, 60_000);
  afterAll(async () => {
    await kit.cleanup();
  }, 60_000);

  it("rejects anyone who is not a signed-in candidate", async () => {
    session.user = null;
    expect((await start(json({}), ctx({ testType: "IQ" }))).status).toBe(403);
    session.user = { id: "someone", role: "RECRUITER" };
    expect((await start(json({}), ctx({ testType: "IQ" }))).status).toBe(403);
    expect((await getSession(new Request("http://localhost/api"), ctx({ id: "x" }))).status).toBe(403);
    expect((await answer(json({ questionId: "q", answer: { key: "B" } }), ctx({ id: "x" }))).status).toBe(403);
    expect((await writing(json({ text: "hello" }), ctx({ id: "x" }))).status).toBe(403);
    session.user = { id: "someone", role: "PLATFORM_ADMIN" };
    expect((await start(json({}), ctx({ testType: "IQ" }))).status).toBe(403);
  });

  it("requires a confirmed email address to start, answer or read a test", async () => {
    const unverified = await kit.addCandidate("unverified", { verified: false });
    session.user = { id: unverified.userId, role: "CANDIDATE" };
    for (const res of [
      await start(json({}), ctx({ testType: "IQ" })),
      await getSession(new Request("http://localhost/api"), ctx({ id: "x" })),
      await answer(json({ questionId: "q", answer: { key: "B" } }), ctx({ id: "x" })),
      await writing(json({ text: "hello" }), ctx({ id: "x" })),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    }
    expect(await prisma.testSession.count({ where: { candidateProfileId: unverified.profileId } })).toBe(0);
  });

  it("a confirmed candidate can start, read the question, answer it and resume", async () => {
    const c = await kit.addCandidate("good");
    session.user = { id: c.userId, role: "CANDIDATE" };

    const started = await start(json({}), ctx({ testType: "IQ" }));
    expect(started.status).toBe(200);
    const { sessionId, resumed } = await started.json();
    expect(resumed).toBe(false);
    expect((await (await start(json({}), ctx({ testType: "IQ" }))).json()).resumed).toBe(true);

    const view = await (await getSession(new Request("http://localhost/api"), ctx({ id: sessionId }))).json();
    expect(view).toMatchObject({ status: "IN_PROGRESS", phase: "QUESTIONS", answered: 0 });
    expect(view.question.options).toHaveLength(4);
    expect(JSON.stringify(view)).not.toContain("correctAnswer");

    const next = await answer(json({ questionId: view.question.id, answer: { key: "B" } }), ctx({ id: sessionId }));
    expect(next.status).toBe(200);
    expect((await next.json()).answered).toBe(1);
  });

  it("explains problems with a clear message and the right status", async () => {
    const c = await kit.addCandidate("errors");
    session.user = { id: c.userId, role: "CANDIDATE" };
    expect((await start(json({}), ctx({ testType: "NOT_A_TEST" }))).status).toBe(404);
    const noSkill = await start(json({}), ctx({ testType: "SKILL" })); // no questions for this role
    expect(noSkill.status).toBe(409);
    expect(await noSkill.json()).toMatchObject({ code: "UNAVAILABLE", error: expect.stringMatching(/Not available yet/) });

    const { sessionId } = await (await start(json({}), ctx({ testType: "IQ" }))).json();
    expect((await answer(json({ nonsense: true }), ctx({ id: sessionId }))).status).toBe(400);
    expect((await getSession(new Request("http://localhost/api"), ctx({ id: "does-not-exist" }))).status).toBe(404);
    const other = await kit.addCandidate("other");
    session.user = { id: other.userId, role: "CANDIDATE" };
    expect((await getSession(new Request("http://localhost/api"), ctx({ id: sessionId }))).status).toBe(404);
  });
});
