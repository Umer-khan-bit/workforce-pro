import { PrismaClient } from "@prisma/client";
import { readSetting } from "../src/lib/settings/store";
import { parsePhrases, refersToOtherOptions } from "../src/lib/testEngine/optionShuffle";

/**
 * Read-only: lists the approved multiple-choice and situational questions that will NOT be shuffled because one of their
 * options refers to the others (the phrases are Settings > Tests > Integrity). Changes nothing.
 *   npm run shuffle:scan
 */
const prisma = new PrismaClient();

async function main() {
  const testing = await readSetting(prisma, "testing");
  const phrases = parsePhrases(testing.integrityNoShufflePhrases);
  const questions = await prisma.question.findMany({
    where: { status: "APPROVED", type: { in: ["MCQ", "SITUATIONAL_JUDGEMENT"] } },
    select: { id: true, testType: true, content: true, options: true, jobRole: { select: { name: true } }, language: { select: { name: true } } },
  });
  const hits = questions.filter((q) => Array.isArray(q.options) && refersToOtherOptions(q.options as { key: string; text: string }[], phrases));

  console.log(`Phrases in use: ${phrases.length}`);
  console.log(`Approved multiple-choice / situational questions: ${questions.length}`);
  console.log(`Kept in their original order (an option refers to another option): ${hits.length}`);

  const tally = (pick: (q: (typeof hits)[number]) => string) => {
    const m = new Map<string, number>();
    for (const q of hits) m.set(pick(q), (m.get(pick(q)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log("\nBy test:");
  for (const [k, n] of tally((q) => q.testType)) console.log(`  ${k}: ${n}`);
  console.log("\nBy job role (Job skill questions have one; the others are not tied to a role):");
  for (const [k, n] of tally((q) => q.jobRole?.name ?? "(no job role)")) console.log(`  ${k}: ${n}`);
  console.log("\nBy language:");
  for (const [k, n] of tally((q) => q.language?.name ?? "(none)")) console.log(`  ${k}: ${n}`);
  console.log("\nBy test and job role:");
  for (const [k, n] of tally((q) => `${q.testType} / ${q.jobRole?.name ?? "no job role"}`)) console.log(`  ${k}: ${n}`);

  console.log("\nExamples (the option that caused it):");
  const patterns = phrases;
  for (const q of hits.slice(0, 8)) {
    const bad = (q.options as { key: string; text: string }[]).find((o) => refersToOtherOptions([o], patterns));
    console.log(`  [${q.testType}] ${q.content.slice(0, 70).replace(/\s+/g, " ")}  ->  ${bad?.key}: "${bad?.text}"`);
  }
}

main().finally(() => prisma.$disconnect());
