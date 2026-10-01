import { PrismaClient } from "@prisma/client";
import { generateBatch, type GenerateParams } from "../src/lib/ai/generate";
import { AiError } from "../src/lib/ai/errors";
import { formatCost } from "../src/lib/ai/cost";

/**
 * Generates demo questions with the same AI generator as the admin page (writer plus a second review
 * pass), in the default language, and saves everything as PENDING so an admin approves it in
 * Platform admin > Approvals. Spends real money, so it stops when the estimated cost reaches the limit.
 *
 *   npm run content:demo            (limit: $3.60 estimated)
 *   MAX_SPEND_USD=2 npm run content:demo
 *
 * Starting amounts: IQ 40, EQ 30, Language 30, and 40 for each job role. IQ, Language and Skill are
 * spread over easy, medium and hard, because the adaptive tests need questions across the whole range.
 */
const prisma = new PrismaClient();
const LIMIT = Number(process.env.MAX_SPEND_USD ?? 3.6);

type Step = Omit<GenerateParams, "languageId" | "count"> & { label: string };

const SPREAD: Array<GenerateParams["difficulty"]> = ["EASY", "MEDIUM", "HARD", "MEDIUM"];

async function main() {
  const [language, admin, roles, ai] = await Promise.all([
    prisma.language.findFirst({ where: { isDefault: true } }),
    prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN", email: process.env.SEED_ADMIN_EMAIL ?? undefined } }).then((u) => u ?? prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN" } })),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.siteSetting.findUnique({ where: { key: "aiGeneration" } }).then((s) => ((s?.value ?? {}) as { batchSize?: number }).batchSize ?? 10),
  ]);
  if (!language || !admin) throw new Error("Run the seed first (a default language and a platform admin are needed).");
  const batch = ai;

  const steps: Step[] = [
    ...SPREAD.map((difficulty, i): Step => ({ label: `IQ ${difficulty.toLowerCase()} #${i + 1}`, testType: "IQ", difficulty })),
    ...[0, 1, 2].map((i): Step => ({ label: `EQ #${i + 1}`, testType: "EQ", difficulty: "MEDIUM" })),
    ...(["EASY", "MEDIUM", "HARD"] as const).map((difficulty): Step => ({ label: `Language ${difficulty.toLowerCase()}`, testType: "LANGUAGE", difficulty })),
    ...roles.flatMap((role) =>
      SPREAD.map((difficulty, i): Step => ({ label: `${role.name} ${difficulty.toLowerCase()} #${i + 1}`, testType: "SKILL", difficulty, jobRoleId: role.id }))
    ),
  ];

  let spent = 0;
  let created = 0;
  let short = 0;
  console.log(`Generating ${steps.length} batches of up to ${batch} (limit ${formatCost(LIMIT)} estimated) in ${language.name}.`);

  for (const [i, step] of steps.entries()) {
    if (spent >= LIMIT) {
      console.log(`Stopping: estimated spend ${formatCost(spent)} has reached the limit of ${formatCost(LIMIT)}.`);
      break;
    }
    const { label, ...params } = step;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await generateBatch({ prisma }, admin.id, { ...params, languageId: language.id, count: batch });
        spent += r.costEstimate;
        created += r.created;
        short += r.shortfall;
        console.log(`[${i + 1}/${steps.length}] ${label}: ${r.created} saved, ${r.dropped} left out${r.shortfall > 0 ? `, SHORT by ${r.shortfall} (${r.attempts} attempts)` : ""}, review ${r.verdicts.OK} ok / ${r.verdicts.NEEDS_FIX} fix / ${r.verdicts.REJECT} reject, ${formatCost(r.costEstimate)} (total ${formatCost(spent)})`);
        break;
      } catch (err) {
        const retryable = err instanceof AiError && (err.code === "RATE_LIMITED" || err.code === "OVERLOADED" || err.code === "NETWORK");
        if (retryable && attempt < 4) {
          console.log(`[${i + 1}/${steps.length}] ${label}: ${(err as AiError).message} Retrying in 60 seconds...`);
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        console.error(`[${i + 1}/${steps.length}] ${label}: stopped. ${err instanceof Error ? err.message : err}`);
        console.log(`Saved so far: ${created} questions, estimated ${formatCost(spent)}.`);
        process.exitCode = 1;
        return;
      }
    }
  }
  console.log(`Done: ${created} questions saved as Pending${short > 0 ? ` (${short} fewer than asked for: run it again to top up)` : ""}, estimated cost ${formatCost(spent)}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
