import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { POST as newVersion } from "@/app/api/admin/questions/[id]/new-version/route";
import { POST as approve } from "@/app/api/admin/questions/[id]/approve/route";
import { bulkApprove } from "./bulkApprove";
import { untranslatedWhere } from "@/lib/ai/translate";

// Whole flow against the real database, in an isolated world (own languages and questions).
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!dbUp)("translations of a question that gets a new version (real database)", () => {
  let kit: Kit;
  let adminId: string;
  let urdu: { id: string };
  let n = 0;

  beforeAll(async () => {
    kit = await createKit(prisma, "tr");
    urdu = await prisma.language.create({ data: { name: `Urdu ${kit.run}`, code: `u${kit.run}`.slice(0, 40), isRtl: true } });
    adminId = (
      await prisma.user.create({
        data: { email: `admin-${kit.run}@example.test`, name: "Admin", password: await hashPassword("x-admin-pass-1"), role: "PLATFORM_ADMIN", emailVerified: new Date() },
      })
    ).id;
    session.user = { id: adminId, role: "PLATFORM_ADMIN" };
  }, 60_000);

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { languageId: urdu.id } });
    await kit.cleanup();
    await prisma.question.deleteMany({ where: { languageId: kit.language.id } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.language.delete({ where: { id: urdu.id } });
  }, 60_000);

  async function english() {
    n++;
    return prisma.question.create({
      data: { testType: "PERSONALITY", type: "LIKERT", content: `${kit.run} I enjoy meeting new people ${n}`, topic: "Extraversion", aParam: 1, bParam: 0, status: "APPROVED", source: "IMPORTED", languageId: kit.language.id },
    });
  }
  async function translation(of: { id: string }, status: "APPROVED" | "PENDING_APPROVAL" | "RETIRED" | "REJECTED", languageId = urdu.id) {
    n++;
    return prisma.question.create({
      data: { testType: "PERSONALITY", type: "LIKERT", content: `${kit.run} translated ${n}`, aParam: 1, bParam: 0, status, source: "AI_TRANSLATED", languageId, translationOfId: of.id },
    });
  }
  const versionForm = (q: { content: string }) => ({ testType: "PERSONALITY", type: "LIKERT", content: `${q.content} (reworded)`, topic: "Extraversion", languageId: kit.language.id });

  it("marks live translations as needing a new translation, and leaves retired or rejected ones alone", async () => {
    const en = await english();
    const live = await translation(en, "APPROVED");
    const waiting = await translation(en, "PENDING_APPROVAL");
    const retired = await translation(en, "RETIRED");
    const rejected = await translation(en, "REJECTED");

    const res = await newVersion(post(versionForm(en)), ctx(en.id));
    expect(res.status).toBe(201);

    const flag = async (id: string) => (await prisma.question.findUniqueOrThrow({ where: { id } })).needsRetranslation;
    expect(await flag(live.id)).toBe(true);
    expect(await flag(waiting.id)).toBe(true);
    expect(await flag(retired.id)).toBe(false);
    expect(await flag(rejected.id)).toBe(false);
    // Still in use until a replacement is approved: marking is not retiring.
    expect((await prisma.question.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("APPROVED");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, action: "QUESTION_VERSIONED", metadata: { path: ["previousVersionId"], equals: en.id } } });
    expect(log.metadata).toMatchObject({ translationsMarkedOutdated: 2 });
  });

  it("lists the new English version as untranslated, so the translate button picks it up again", async () => {
    const en = await english();
    await translation(en, "APPROVED");
    const untranslated = async () => (await prisma.question.findMany({ where: untranslatedWhere(kit.language.id, urdu.id), select: { id: true } })).map((q) => q.id);
    expect(await untranslated()).not.toContain(en.id); // already translated

    const { question: v2 } = await (await newVersion(post(versionForm(en)), ctx(en.id))).json();
    const ids = await untranslated();
    expect(ids).toContain(v2.id); // the new wording needs a translation
    expect(ids).not.toContain(en.id); // the retired original is skipped
  });

  it("retires the outdated translation (same language only) when a translation of the new version is approved", async () => {
    const en = await english();
    const oldUrdu = await translation(en, "APPROVED");
    const oldOther = await translation(en, "APPROVED", kit.language.id); // another language: must stay
    const res = await newVersion(post(versionForm(en)), ctx(en.id));
    const { question: v2 } = await res.json();

    const fresh = await translation({ id: v2.id }, "PENDING_APPROVAL");
    expect((await approve(post({}), ctx(fresh.id))).status).toBe(200);

    expect(await prisma.question.findUniqueOrThrow({ where: { id: oldUrdu.id } })).toMatchObject({ status: "RETIRED", needsRetranslation: false });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: oldOther.id } })).toMatchObject({ status: "APPROVED", needsRetranslation: true });
    expect((await prisma.question.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("APPROVED");
  });

  it("does the same for bulk approval and across several versions", async () => {
    const en = await english();
    const oldUrdu = await translation(en, "APPROVED");
    const v2 = (await (await newVersion(post(versionForm(en)), ctx(en.id))).json()).question;
    const v3 = (await (await newVersion(post(versionForm({ content: (await prisma.question.findUniqueOrThrow({ where: { id: v2.id } })).content })), ctx(v2.id))).json()).question;
    const fresh = await translation({ id: v3.id }, "PENDING_APPROVAL");

    const r = await bulkApprove(prisma, [fresh.id], adminId, false);
    expect(r.approved).toBe(1);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: oldUrdu.id } })).status).toBe("RETIRED");
  });

  it("does not touch translations of a question that never got a new version", async () => {
    const en = await english();
    const keep = await translation(en, "APPROVED");
    const other = await english();
    const v2 = (await (await newVersion(post(versionForm(other)), ctx(other.id))).json()).question;
    const fresh = await translation({ id: v2.id }, "PENDING_APPROVAL");
    await approve(post({}), ctx(fresh.id));
    expect(await prisma.question.findUniqueOrThrow({ where: { id: keep.id } })).toMatchObject({ status: "APPROVED", needsRetranslation: false });
  });
});
