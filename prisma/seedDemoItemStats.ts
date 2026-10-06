import type { PrismaClient } from "@prisma/client";
import { seededRandom } from "../src/lib/testEngine/rng";

/**
 * Demo item analysis: summary statistics (answers, share correct, discrimination, difficulty, bias gaps) for a spread of
 * approved questions, a few flagged for review and two pretest questions that are ready to be made operational, plus a
 * recalibration run. Like the demo results these are summaries only: no answer rows are written, so no question is
 * locked and a real recalibration leaves them alone (it needs answer rows). Demo mode only; does nothing if any exist.
 */
export async function seedDemoItemStats(prisma: PrismaClient): Promise<number> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo item statistics: DEMO_MODE is not 'true'.");
  if ((await prisma.itemStatistic.count()) > 0) return 0;
  const random = seededRandom(20261006);
  const questions = await prisma.question.findMany({ where: { status: "APPROVED", type: "MCQ", testType: { in: ["IQ", "LANGUAGE", "SKILL"] } }, orderBy: { id: "asc" }, select: { id: true, testType: true } });
  const pick = (type: string, n: number) => questions.filter((q) => q.testType === type).slice(0, n);
  const chosen = [...pick("IQ", 8), ...pick("LANGUAGE", 4), ...pick("SKILL", 24)];
  if (chosen.length < 8) return 0;

  const now = new Date();
  const admin = await prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN" }, orderBy: { createdAt: "asc" } });
  const run = await prisma.recalibrationRun.create({ data: { triggeredBy: admin?.email ?? "scheduler", startedAt: new Date(now.getTime() - 2 * 86_400_000), completedAt: new Date(now.getTime() - 2 * 86_400_000 + 40_000), status: "COMPLETED", itemsChecked: chosen.length, itemsUpdated: chosen.length, itemsFlagged: 3 } });
  void run;

  let n = 0;
  for (const [i, q] of chosen.entries()) {
    const responseCount = 210 + Math.floor(random() * 190);
    let rate = 0.35 + random() * 0.4;
    let disc = 0.32 + random() * 0.3;
    let difGender = (random() - 0.5) * 0.1;
    let flagReason: string | null = null;
    if (i === 1) { rate = 0.94; flagReason = `Too easy: ${Math.round(rate * 100)}% answer it correctly.`; }
    if (i === 13) { disc = 0.08; flagReason = `Does not separate strong from weak candidates well (${disc.toFixed(2)}).`; }
    if (i === 19) { difGender = 0.27; flagReason = `Possible bias by gender: equally able candidates differ by ${Math.round(difGender * 100)}%.`; }
    await prisma.itemStatistic.create({
      data: {
        questionId: q.id,
        responseCount,
        correctCount: Math.round(responseCount * rate),
        discrimination: Math.round(disc * 100) / 100,
        difficulty: Math.round(((0.55 - rate) * 4) * 100) / 100,
        difByGender: Math.round(difGender * 100) / 100,
        difByRegion: Math.round((random() - 0.5) * 0.12 * 100) / 100,
        difByLanguage: null,
        flagged: flagReason !== null,
        flagReason,
        lastCalibratedAt: new Date(now.getTime() - 2 * 86_400_000),
      },
    });
    n++;
  }
  // Two calibrated pretest questions, ready to be made operational from Item analysis > Pretest ready.
  const pretest = chosen.filter((q) => q.testType === "SKILL").slice(-2);
  await prisma.question.updateMany({ where: { id: { in: pretest.map((q) => q.id) } }, data: { isPretest: true } });
  return n;
}
