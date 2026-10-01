import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "question">;

/**
 * When an English question gets a new version, the translations of the old wording may no longer say the
 * same thing. They are marked `needsRetranslation` (and listed in Approvals) until a translation of the
 * new version is approved. Retired and rejected translations are left alone. Returns how many were marked.
 */
export async function flagOutdatedTranslations(db: Db, replacedQuestionId: string): Promise<number> {
  const { count } = await db.question.updateMany({
    where: { translationOfId: replacedQuestionId, status: { notIn: ["RETIRED", "REJECTED"] } },
    data: { needsRetranslation: true },
  });
  return count;
}

/**
 * Called after questions are approved. A newly approved translation of a new English version replaces the
 * outdated translation (same language) of an earlier version, so the outdated one is retired and the
 * candidate never sees both. Returns how many outdated translations were retired.
 */
export async function retireReplacedTranslations(db: Db, approvedIds: string[]): Promise<number> {
  if (approvedIds.length === 0) return 0;
  const approved = await db.question.findMany({
    where: { id: { in: approvedIds }, translationOfId: { not: null } },
    select: { id: true, languageId: true, translationOfId: true },
  });
  let retired = 0;
  for (const t of approved) {
    // Walk back through the English versions (v3 replaced v2 replaced v1) and retire outdated translations of any of them.
    const earlier: string[] = [];
    let cursor = t.translationOfId;
    for (let hops = 0; cursor && hops < 20; hops++) {
      const original = await db.question.findUnique({ where: { id: cursor }, select: { previousVersionId: true } });
      cursor = original?.previousVersionId ?? null;
      if (cursor) earlier.push(cursor);
    }
    if (earlier.length === 0) continue;
    const { count } = await db.question.updateMany({
      where: {
        id: { not: t.id },
        translationOfId: { in: earlier },
        languageId: t.languageId,
        needsRetranslation: true,
        status: { notIn: ["RETIRED", "REJECTED"] },
      },
      data: { status: "RETIRED", needsRetranslation: false },
    });
    retired += count;
  }
  return retired;
}
