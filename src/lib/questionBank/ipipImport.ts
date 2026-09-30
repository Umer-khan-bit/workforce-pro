import type { PrismaClient } from "@prisma/client";
import { IPIP_50_ITEMS } from "./ipipItems";
import { readSetting } from "@/lib/settings/store";

export type IpipImportResult = { created: number; skipped: number };

/**
 * Imports the 50 IPIP Big Five items as APPROVED English personality questions. Safe to run
 * repeatedly: an item that already exists (same text, same language) is skipped.
 * `actorId` is recorded as the approver; the seed has no signed-in admin, so it may be null.
 */
export async function importIpipItems(
  prisma: PrismaClient,
  actorId: string | null
): Promise<IpipImportResult> {
  // The IPIP items are English, so they go in under the default language (set in the admin panel).
  const english = await prisma.language.findFirst({ where: { isDefault: true } });
  if (!english) throw new Error("No default language is set. Run the seed or set one in the admin panel.");
  const defaults = await readSetting(prisma, "itemDefaults");

  const existing = await prisma.question.findMany({
    where: { testType: "PERSONALITY", languageId: english.id },
    select: { content: true },
  });
  const have = new Set(existing.map((q) => q.content));
  const missing = IPIP_50_ITEMS.filter((i) => !have.has(i.content));

  if (missing.length > 0) {
    const now = new Date();
    await prisma.question.createMany({
      data: missing.map((i) => ({
        testType: "PERSONALITY" as const,
        type: "LIKERT" as const,
        content: i.content,
        topic: i.trait,
        reverseKeyed: i.reverse,
        aParam: defaults.discrimination,
        bParam: defaults.difficultyMedium,
        languageId: english.id,
        status: "APPROVED" as const,
        approvedById: actorId,
        approvedAt: now,
        createdById: actorId,
      })),
    });
  }

  const result = { created: missing.length, skipped: IPIP_50_ITEMS.length - missing.length };

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "QUESTION_IPIP_IMPORTED",
        targetType: "Question",
        metadata: result,
      },
    });
  }
  return result;
}
