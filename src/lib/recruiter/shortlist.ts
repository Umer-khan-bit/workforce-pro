import type { PrismaClient, ShortlistStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { isTopPerformer } from "@/lib/results/topPerformer";
import { recruiterVisibleWhere } from "./candidateAccess";
import { getEntitlements, hasRoom, planBlockMessage } from "./entitlements";
import { emitWebhook } from "@/lib/ats/webhooks";

export class HiringError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "HiringError";
  }
}

/** The pipeline in order, then the exit. A shortlisted candidate moves along it (or back) and ends Hired or Rejected. */
export const PIPELINE: ShortlistStatus[] = ["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED"];
export const STATUS_LABELS: Record<ShortlistStatus, string> = {
  SHORTLISTED: "Shortlisted",
  CONTACTED: "Contacted",
  INTERVIEWING: "Interviewing",
  OFFERED: "Offered",
  HIRED: "Hired",
  REJECTED: "Rejected",
};
/** Entries in these statuses are "in the pipeline" and count towards the plan's shortlist limit. */
const ENDED: ShortlistStatus[] = ["HIRED", "REJECTED"];

type Db = PrismaClient;

type Actor = { id: string; role: "RECRUITER" | "COMPANY_ADMIN"; companyId: string; name: string | null };

async function loadActor(db: Pick<PrismaClient, "user">, userId: string, allowed: Array<"RECRUITER" | "COMPANY_ADMIN">): Promise<Actor> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, companyId: true, isActive: true, name: true } });
  if (!u?.isActive || !u.companyId || !allowed.includes(u.role as "RECRUITER" | "COMPANY_ADMIN")) throw new HiringError(403, "FORBIDDEN", "Not allowed.");
  return { id: u.id, role: u.role as Actor["role"], companyId: u.companyId, name: u.name };
}
export { loadActor };

/** How many candidates the company currently has in the pipeline (counts against the plan limit). */
export function pipelineCount(db: Pick<PrismaClient, "shortlist">, companyId: string): Promise<number> {
  return db.shortlist.count({ where: { recruiter: { companyId }, status: { notIn: ENDED } } });
}

/**
 * Puts a candidate on the recruiter's shortlist for one of the company's open job openings. The server checks
 * the plan (search access, Top Performer access, the shortlist limit), the minimum-salary rule against the
 * opening's offer, and that the opening belongs to the company.
 */
export async function addToShortlist(db: Db, args: { recruiterId: string; candidateProfileId: string; jobOpeningId: string; note?: string }) {
  const actor = await loadActor(db, args.recruiterId, ["RECRUITER"]);
  const ent = await getEntitlements(actor.companyId);
  if (!ent.canSearch) throw new HiringError(403, "PLAN_FEATURE_REQUIRED", planBlockMessage(ent, "shortlisting candidates"));

  const opening = await db.jobOpening.findFirst({ where: { id: args.jobOpeningId, companyId: actor.companyId } });
  if (!opening) throw new HiringError(404, "OPENING_NOT_FOUND", "That job opening was not found in your company.");
  if (opening.status !== "OPEN") throw new HiringError(409, "OPENING_CLOSED", "That job opening is not open.");

  const candidate = await db.candidateProfile.findFirst({ where: { AND: [{ id: args.candidateProfileId }, recruiterVisibleWhere(opening.salaryRangeMax)] }, select: { id: true } });
  if (!candidate || (!ent.canSeeTopPerformers && (await isTopPerformer(db, candidate.id)))) {
    throw new HiringError(404, "CANDIDATE_NOT_AVAILABLE", "This candidate is not available for this job opening.");
  }

  const used = await pipelineCount(db, actor.companyId);
  if (!hasRoom(ent.shortlistLimit, used)) {
    throw new HiringError(403, "LIMIT_REACHED", `Your plan allows ${ent.shortlistLimit} shortlisted candidates at a time. Move some to Hired or Rejected, remove some, or upgrade your plan.`);
  }

  try {
    const entry = await db.$transaction(async (tx) => {
      const created = await tx.shortlist.create({
        data: { recruiterId: actor.id, candidateProfileId: candidate.id, jobOpeningId: opening.id, note: args.note?.trim() || null, status: "SHORTLISTED" },
      });
      await tx.shortlistStatusHistory.create({ data: { shortlistId: created.id, status: "SHORTLISTED", changedById: actor.id } });
      return created;
    });
    await db.auditLog.create({ data: { actorId: actor.id, action: "CANDIDATE_SHORTLISTED", targetType: "CandidateProfile", targetId: candidate.id, metadata: { jobOpeningId: opening.id } } });
    await emitWebhook(db, actor.companyId, "shortlist.created", { reference: entry.id, status: "SHORTLISTED", candidate: { id: candidate.id }, jobOpening: { id: opening.id, title: opening.title } });
    return entry;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new HiringError(409, "ALREADY_SHORTLISTED", "This candidate is already on your shortlist for that job opening.");
    throw err;
  }
}

async function loadEntry(db: Db, actor: Actor, id: string) {
  const entry = await db.shortlist.findFirst({
    where: { id, recruiter: { companyId: actor.companyId }, ...(actor.role === "RECRUITER" ? { recruiterId: actor.id } : {}) },
    include: { jobOpening: { select: { jobRole: { select: { name: true } } } } },
  });
  if (!entry) throw new HiringError(404, "NOT_FOUND", "Shortlist entry not found.");
  return entry;
}

/** Moves a shortlisted candidate to another stage and records the date. A hire is reported to the company admins. */
export async function setShortlistStatus(db: Db, args: { actorId: string; shortlistId: string; status: ShortlistStatus }) {
  const actor = await loadActor(db, args.actorId, ["RECRUITER", "COMPANY_ADMIN"]);
  const entry = await loadEntry(db, actor, args.shortlistId);
  if (entry.status === args.status) return entry;

  const ent = await getEntitlements(actor.companyId);
  // Moving someone back into the pipeline counts against the limit again.
  if (ENDED.includes(entry.status) && !ENDED.includes(args.status) && !hasRoom(ent.shortlistLimit, await pipelineCount(db, actor.companyId))) {
    throw new HiringError(403, "LIMIT_REACHED", `Your plan allows ${ent.shortlistLimit} shortlisted candidates at a time.`);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.shortlist.update({ where: { id: entry.id }, data: { status: args.status } });
    await tx.shortlistStatusHistory.create({ data: { shortlistId: entry.id, status: args.status, changedById: actor.id } });
    return row;
  });
  await db.auditLog.create({ data: { actorId: actor.id, action: "SHORTLIST_STATUS_CHANGED", targetType: "Shortlist", targetId: entry.id, metadata: { from: entry.status, to: args.status } } });

  const hook = { reference: entry.id, status: args.status, previousStatus: entry.status, candidate: { id: entry.candidateProfileId }, jobOpening: { id: entry.jobOpeningId } };
  await emitWebhook(db, actor.companyId, "shortlist.status_changed", hook);
  if (args.status === "HIRED") await emitWebhook(db, actor.companyId, "candidate.hired", hook);

  if (args.status === "HIRED") {
    const admins = await db.user.findMany({ where: { companyId: actor.companyId, role: "COMPANY_ADMIN", isActive: true }, select: { id: true } });
    for (const a of admins.filter((x) => x.id !== actor.id)) {
      await notifyUser(db, {
        userId: a.id,
        templateKey: "CANDIDATE_HIRED_IN_APP",
        type: "GENERAL",
        values: { recruiterName: actor.name ?? "A recruiter", roleName: entry.jobOpening.jobRole.name },
        link: "/company-admin/reports",
      });
    }
  }
  return updated;
}

export async function setShortlistNote(db: Db, args: { actorId: string; shortlistId: string; note: string }) {
  const actor = await loadActor(db, args.actorId, ["RECRUITER", "COMPANY_ADMIN"]);
  const entry = await loadEntry(db, actor, args.shortlistId);
  return db.shortlist.update({ where: { id: entry.id }, data: { note: args.note.trim() || null } });
}

/** Takes a candidate off the shortlist (their history goes with it). */
export async function removeFromShortlist(db: Db, args: { actorId: string; shortlistId: string }) {
  const actor = await loadActor(db, args.actorId, ["RECRUITER", "COMPANY_ADMIN"]);
  const entry = await loadEntry(db, actor, args.shortlistId);
  await db.$transaction([db.shortlistStatusHistory.deleteMany({ where: { shortlistId: entry.id } }), db.shortlist.delete({ where: { id: entry.id } })]);
  await db.auditLog.create({ data: { actorId: actor.id, action: "SHORTLIST_ENTRY_REMOVED", targetType: "CandidateProfile", targetId: entry.candidateProfileId, metadata: { jobOpeningId: entry.jobOpeningId } } });
}

/** After a contact request is sent, a shortlisted candidate for the same opening moves on to "Contacted". */
export async function markContacted(db: Pick<PrismaClient, "shortlist" | "shortlistStatusHistory" | "$transaction">, args: { candidateProfileId: string; jobOpeningId: string; actorId: string }) {
  const entries = await db.shortlist.findMany({ where: { candidateProfileId: args.candidateProfileId, jobOpeningId: args.jobOpeningId, status: "SHORTLISTED" }, select: { id: true } });
  for (const e of entries) {
    await db.$transaction([
      db.shortlist.update({ where: { id: e.id }, data: { status: "CONTACTED" } }),
      db.shortlistStatusHistory.create({ data: { shortlistId: e.id, status: "CONTACTED", changedById: args.actorId } }),
    ]);
  }
}
