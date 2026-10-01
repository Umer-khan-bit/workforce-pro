import type { PrismaClient } from "@prisma/client";
import { getPilot, pilotBlocksCompany } from "@/lib/pilot";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { AtsError } from "./apiKeys";
import { getAtsConnector, type AtsConnector } from "./connector";
import { loadAtsCandidates } from "./payload";
import { emitWebhook } from "./webhooks";

type Db = PrismaClient;

export type PushResult = { pushed: { reference: string; externalId: string }[]; failed: { reference: string; reason: string }[]; skipped: number };

/**
 * Pushes shortlisted candidates to the company's ATS. Recruiters push their own entries; company admins any in the
 * company. The plan must include ATS and API access. Every push is recorded (AtsExport) and audit-logged, tells the
 * company's webhooks, and a failure for one candidate does not stop the others. Entries that are no longer
 * visible (the candidate's minimum no longer fits, a deleted account, a Top Performer the plan cannot see) are skipped.
 */
export async function pushToAts(db: Db, args: { userId: string; shortlistIds: string[]; connector?: AtsConnector }): Promise<PushResult> {
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true, role: true, isActive: true, companyId: true } });
  if (!user?.isActive || !user.companyId || (user.role !== "RECRUITER" && user.role !== "COMPANY_ADMIN")) throw new AtsError(403, "FORBIDDEN", "Not allowed.");
  const ent = await getEntitlements(user.companyId);
  if (!ent.canUseAts) throw new AtsError(403, "PLAN_FEATURE_REQUIRED", planBlockMessage(ent, "ATS and API access"));
  if (pilotBlocksCompany(await getPilot(db), user.companyId)) throw new AtsError(403, "PILOT_MODE", "The platform is in a pilot for another company right now.");
  const ids = [...new Set(args.shortlistIds)].slice(0, 200);
  if (ids.length === 0) throw new AtsError(400, "NOTHING_SELECTED", "Choose at least one candidate.");

  const connector = args.connector ?? getAtsConnector(db);
  const candidates = await loadAtsCandidates(db, { companyId: user.companyId, ...(user.role === "RECRUITER" ? { recruiterId: user.id } : {}), ids });
  const result: PushResult = { pushed: [], failed: [], skipped: ids.length - candidates.length };

  for (const c of candidates) {
    const record = await db.atsExport.create({ data: { candidateProfileId: c.candidate.id, companyId: user.companyId, status: "PENDING", payload: c as never } });
    try {
      const { externalId } = await connector.push(user.companyId, c);
      await db.atsExport.update({ where: { id: record.id }, data: { status: "SUCCESS", externalId } });
      result.pushed.push({ reference: c.reference, externalId });
      await emitWebhook(db, user.companyId, "candidate.exported", { reference: c.reference, externalId, candidate: { id: c.candidate.id, name: c.candidate.name }, jobOpening: { id: c.jobOpening.id, title: c.jobOpening.title } });
    } catch (err) {
      await db.atsExport.update({ where: { id: record.id }, data: { status: "FAILED" } });
      result.failed.push({ reference: c.reference, reason: err instanceof Error ? err.message : "The ATS did not accept it." });
    }
  }
  await db.auditLog.create({ data: { actorId: user.id, action: "ATS_PUSH", targetType: "Company", targetId: user.companyId, metadata: { pushed: result.pushed.length, failed: result.failed.length, skipped: result.skipped, connector: connector.name } } });
  return result;
}
