import { PrismaClient } from "@prisma/client";
import { seedDemoStory } from "./seedDemoStory";

/**
 * Puts the live part of the demo back, so it can be shown again: Sana's shortlist entry and contact request for Faisal
 * Chaudhry are removed, and the request waiting for Ayesha Khan is sent again. Nothing else is touched (questions, results and
 * accounts stay). Demo mode only.
 *
 *   npm run demo:reset
 */
export async function resetDemoStory(prisma: PrismaClient): Promise<void> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to reset the demo: DEMO_MODE is not 'true'.");
  const [sana, faisal, ayesha] = await Promise.all([
    prisma.user.findUnique({ where: { email: "recruiter@demo.test" }, select: { id: true } }),
    prisma.candidateProfile.findFirst({ where: { user: { email: "faisal.chaudhry@demo.test" } }, select: { id: true } }),
    prisma.candidateProfile.findFirst({ where: { user: { email: "candidate@demo.test" } }, select: { id: true } }),
  ]);
  if (sana && faisal) {
    await prisma.contactRequest.deleteMany({ where: { recruiterId: sana.id, candidateProfileId: faisal.id } });
    const entries = await prisma.shortlist.findMany({ where: { recruiterId: sana.id, candidateProfileId: faisal.id }, select: { id: true } });
    await prisma.shortlistStatusHistory.deleteMany({ where: { shortlistId: { in: entries.map((e) => e.id) } } });
    await prisma.shortlist.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
  }
  if (ayesha) {
    // Requests that Ayesha answered from recruiters at the second company (the one this script re-sends).
    await prisma.contactRequest.deleteMany({ where: { candidateProfileId: ayesha.id, recruiter: { email: "recruiter.zainab@demo.test" } } });
    await seedDemoStory(prisma);
  }
}

if (process.argv[1]?.includes("resetDemoStory")) {
  const prisma = new PrismaClient();
  resetDemoStory(prisma)
    .then(() => console.log("Demo story reset: Faisal's request removed, Ayesha's request waiting again."))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
