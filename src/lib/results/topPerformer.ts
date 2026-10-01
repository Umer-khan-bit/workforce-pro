import type { PrismaClient, TestType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { readSetting } from "@/lib/settings/store";
import { TEST_TITLES } from "@/lib/testEngine/labels";

type Db = Pick<PrismaClient, "score" | "badge" | "user" | "candidateProfile" | "siteSetting" | "messageTemplate" | "notification" | "auditLog">;

export type TopPerformerRule = { requiredQuartile: number; countedTests: TestType[] };

/** Pure rule: every counted test has a result, and each is in the required quartile or better. */
export function meetsTopPerformerRule(quartileByTest: Partial<Record<TestType, number | null>>, rule: TopPerformerRule): boolean {
  return rule.countedTests.every((t) => {
    const q = quartileByTest[t];
    return typeof q === "number" && q <= rule.requiredQuartile;
  });
}

/** Progress towards the badge: one entry per counted test, with whether it is met yet. */
export function topPerformerProgress(quartileByTest: Partial<Record<TestType, number | null>>, rule: TopPerformerRule) {
  return rule.countedTests.map((testType) => {
    const q = quartileByTest[testType];
    const quartile = typeof q === "number" ? q : null;
    return { testType, title: TEST_TITLES[testType], quartile, met: quartile !== null && quartile <= rule.requiredQuartile };
  });
}

/** The candidate's current quartile in each test: latest finished (not provisional) result. */
export async function currentQuartiles(db: Pick<PrismaClient, "score">, candidateProfileId: string) {
  const scores = await db.score.findMany({
    where: { candidateProfileId, provisional: false, quartile: { not: null } },
    orderBy: { computedAt: "desc" },
    distinct: ["testType"],
    select: { testType: true, quartile: true },
  });
  return Object.fromEntries(scores.map((s) => [s.testType, s.quartile])) as Partial<Record<TestType, number | null>>;
}

/**
 * Checks the top-performer rule from Settings (Settings > Top performer) after a result is stored.
 * When a candidate newly meets it: the badge is saved (once), and the recognition email and in-app
 * notification are sent from their message templates. Never throws, and never awards twice.
 */
export async function evaluateTopPerformer(db: Db, candidateProfileId: string): Promise<{ awarded: boolean }> {
  try {
    const rule = await readSetting(db, "topPerformer");
    const quartiles = await currentQuartiles(db, candidateProfileId);
    if (!meetsTopPerformerRule(quartiles, rule)) return { awarded: false };

    const profile = await db.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: { userId: true, anonymisedAt: true, user: { select: { name: true } } },
    });
    if (!profile || profile.anonymisedAt) return { awarded: false };

    try {
      await db.badge.create({ data: { candidateProfileId, type: "TOP_PERFORMER_ALL_TESTS" } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { awarded: false }; // already has it
      throw err;
    }

    const values = { candidateName: profile.user.name ?? "there" };
    await notifyUser(db, { userId: profile.userId, templateKey: "TOP_PERFORMER_EMAIL", type: "TOP_PERFORMER", values, link: "/candidate/badges" });
    await notifyUser(db, { userId: profile.userId, templateKey: "TOP_PERFORMER_IN_APP", type: "TOP_PERFORMER", values, link: "/candidate/badges" });
    await db.badge.updateMany({ where: { candidateProfileId, type: "TOP_PERFORMER_ALL_TESTS" }, data: { notifiedAt: new Date() } });
    await db.auditLog.create({
      data: { actorId: profile.userId, action: "BADGE_AWARDED", targetType: "CandidateProfile", targetId: candidateProfileId, metadata: { badge: "TOP_PERFORMER_ALL_TESTS", requiredQuartile: rule.requiredQuartile, tests: rule.countedTests } },
    });
    return { awarded: true };
  } catch (err) {
    console.error(`[top performer] could not check the badge: ${err instanceof Error ? err.message : "unknown error"}`);
    return { awarded: false };
  }
}
