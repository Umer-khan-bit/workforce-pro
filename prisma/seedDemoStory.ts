import type { PrismaClient } from "@prisma/client";
import { createContactRequest } from "../src/lib/recruiter/contactRequests";

/**
 * One request waiting for the demo candidate, so the demo can show "Recruiter requests" with something to accept or
 * decline. It goes through the same code recruiters use (minimum salary rule, notification, email). Demo mode only;
 * does nothing if the demo candidate already has a request waiting.
 */
export async function seedDemoStory(prisma: PrismaClient): Promise<boolean> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo requests: DEMO_MODE is not 'true'.");
  const candidate = await prisma.candidateProfile.findFirst({ where: { user: { email: "candidate@demo.test" } }, select: { id: true, jobRoleId: true } });
  if (!candidate?.jobRoleId) return false;
  if ((await prisma.contactRequest.count({ where: { candidateProfileId: candidate.id, status: "SENT" } })) > 0) return false;
  const answered = await prisma.contactRequest.findMany({ where: { candidateProfileId: candidate.id }, select: { jobOpeningId: true } });
  // A second company with an open opening for the candidate's role, so there is something new to answer.
  const other = await prisma.user.findFirst({ where: { role: "RECRUITER", isActive: true, email: "recruiter.zainab@demo.test" }, select: { id: true, companyId: true, company: { select: { city: true } } } });
  if (other?.companyId && !(await prisma.jobOpening.findFirst({ where: { companyId: other.companyId, jobRoleId: candidate.jobRoleId, status: "OPEN" } }))) {
    await prisma.jobOpening.create({ data: { companyId: other.companyId, createdById: other.id, jobRoleId: candidate.jobRoleId, title: "Accounts officer", city: other.company?.city ?? "Islamabad", salaryRangeMin: 85_000, salaryRangeMax: 130_000, createdAt: new Date(Date.now() - 6 * 86_400_000) } });
  }
  const openings = await prisma.jobOpening.findMany({ where: { status: "OPEN", jobRoleId: candidate.jobRoleId, id: { notIn: answered.map((a) => a.jobOpeningId).filter((x): x is string => !!x) } }, orderBy: { createdAt: "desc" } });
  for (const opening of openings) {
    try {
      await createContactRequest(prisma, { recruiterUserId: opening.createdById, candidateProfileId: candidate.id, jobOpeningId: opening.id, message: "Your assessment results match what we are looking for. Would you be open to a short call about this role?" });
      return true;
    } catch {
      // Not allowed for this opening (salary, plan): try the next one.
    }
  }
  return false;
}
