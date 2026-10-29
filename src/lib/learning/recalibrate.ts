import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { correctRate, discrimination, fitItem, flagReasons, worstDif, type GroupPoint } from "./itemStats";

type Db = PrismaClient;

export type RecalibrationSummary = { runId: string; checked: number; updated: number; newlyFlagged: number; flaggedTotal: number; pretestReady: number };

/**
 * The self-learning job (scheduled, and the manual "Run now" button).
 *
 * For every question with at least the number of answers set in Settings > Self-learning:
 *  - its difficulty and discrimination are re-estimated from the answers (the final ability of every candidate
 *    who finished the test) and saved on the question, so the adaptive tests use the better numbers;
 *  - its statistics are refreshed: share correct, how well it separates strong from weak candidates, and
 *    differential item functioning (DIF) by gender, region and language;
 *  - it is FLAGGED for admin review if it is too easy or too hard, discriminates poorly, or shows possible bias.
 *
 * Nothing is ever deleted or retired automatically: a flag only puts the question on the admin's review list. A
 * question an admin has reviewed (and kept) is not flagged again until it has collected a full set of new answers.
 * AI never makes hiring decisions; this only improves how the tests measure.
 */
export async function recalibrate(db: Db, args: { triggeredBy: string; now?: Date }): Promise<RecalibrationSummary> {
  const now = args.now ?? new Date();
  const rules = await readSetting(db, "selfLearning");
  const run = await db.recalibrationRun.create({ data: { triggeredBy: args.triggeredBy } });

  try {
    const stats = await db.itemStatistic.findMany({
      where: { responseCount: { gte: rules.minResponsesForRecalibration }, question: { status: { in: ["APPROVED", "RETIRED"] }, type: { in: ["MCQ", "SITUATIONAL_JUDGEMENT"] } } },
      include: { question: { select: { id: true, aParam: true, bParam: true } } },
    });
    let updated = 0;
    let newlyFlagged = 0;

    for (const stat of stats) {
      const answeredRows = await db.response.findMany({
        where: { questionId: stat.questionId, isCorrect: { not: null }, session: { status: "COMPLETED" } },
        select: { isCorrect: true, answerGiven: true, session: { select: { theta: true, languageId: true, candidateProfile: { select: { gender: true, regionId: true } } } } },
      });
      // A question that ran out of time counts against the candidate but says nothing about how hard the question is.
      const responses = answeredRows.filter((r) => !(r.answerGiven as { unanswered?: boolean } | null)?.unanswered);
      const points = responses.map((r) => ({ theta: r.session.theta, correct: Boolean(r.isCorrect) }));
      if (points.length < rules.minResponsesForRecalibration) continue;

      const fit = fitItem(points, { a: stat.question.aParam, b: stat.question.bParam });
      const rate = correctRate(points);
      const disc = discrimination(points);
      const group = (pick: (r: (typeof responses)[number]) => string | null): GroupPoint[] => responses.map((r) => ({ theta: r.session.theta, correct: Boolean(r.isCorrect), group: pick(r) }));
      // Gender is compared as female against male; "other" and "prefer not to say" are too few to compare on their own.
      const gender = group((r) => (r.session.candidateProfile.gender === "FEMALE" || r.session.candidateProfile.gender === "MALE" ? r.session.candidateProfile.gender : null));
      const difGender = worstDif(gender, rules.minGroupResponses);
      const difRegion = worstDif(group((r) => r.session.candidateProfile.regionId), rules.minGroupResponses);
      const difLanguage = worstDif(group((r) => r.session.languageId), rules.minGroupResponses);

      const reasons = flagReasons({ responseCount: stat.responseCount, correctRate: rate, discrimination: disc, difByGender: difGender?.gap ?? null, difByRegion: difRegion?.gap ?? null, difByLanguage: difLanguage?.gap ?? null }, rules);
      // An admin who reviewed and kept the question has it left alone until enough new answers have come in.
      const reviewedRecently = stat.reviewedAt !== null && stat.reviewedAtCount !== null && stat.responseCount - stat.reviewedAtCount < rules.minResponsesForRecalibration;
      const flagNow = reasons.length > 0 && !reviewedRecently;
      const becomesFlagged = flagNow && !stat.flagged;

      await db.$transaction([
        db.question.update({ where: { id: stat.questionId }, data: { aParam: fit.a, bParam: fit.b } }),
        db.itemStatistic.update({
          where: { id: stat.id },
          data: {
            discrimination: disc,
            difficulty: fit.b,
            difByGender: difGender?.gap ?? null,
            difByRegion: difRegion?.gap ?? null,
            difByLanguage: difLanguage?.gap ?? null,
            lastCalibratedAt: now,
            ...(flagNow ? { flagged: true, flagReason: reasons.map((r) => r.text).join(" ") } : {}),
          },
        }),
      ]);
      updated++;
      if (becomesFlagged) newlyFlagged++;
    }

    const [flaggedTotal, pretestReady] = await Promise.all([
      db.itemStatistic.count({ where: { flagged: true } }),
      db.question.count({ where: { isPretest: true, status: "APPROVED", itemStatistic: { is: { lastCalibratedAt: { not: null } } } } }),
    ]);
    await db.recalibrationRun.update({ where: { id: run.id }, data: { completedAt: new Date(), status: "COMPLETED", itemsChecked: stats.length, itemsUpdated: updated, itemsFlagged: newlyFlagged } });
    return { runId: run.id, checked: stats.length, updated, newlyFlagged, flaggedTotal, pretestReady };
  } catch (err) {
    await db.recalibrationRun.update({ where: { id: run.id }, data: { completedAt: new Date(), status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "unknown error" } });
    throw err;
  }
}
