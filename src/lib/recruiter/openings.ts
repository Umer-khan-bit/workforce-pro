import { z } from "zod";
import type { JobOpeningStatus, PrismaClient } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { getEntitlements, hasRoom, planBlockMessage } from "./entitlements";
import { HiringError, loadActor } from "./shortlist";

export const OPENING_STATUSES: JobOpeningStatus[] = ["OPEN", "PAUSED", "FILLED", "CLOSED"];
export const OPENING_STATUS_LABELS: Record<JobOpeningStatus, string> = { OPEN: "Open", PAUSED: "Paused", FILLED: "Filled", CLOSED: "Closed" };

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const openingInputSchema = z
  .object({
    jobRoleId: z.string().min(1, "Choose a job role"),
    title: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    city: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    salaryRangeMin: z.coerce.number().int().min(0).max(100_000_000),
    salaryRangeMax: z.coerce.number().int().min(1).max(100_000_000),
    status: z.enum(["OPEN", "PAUSED", "FILLED", "CLOSED"]).default("OPEN"),
  })
  .refine((o) => o.salaryRangeMin <= o.salaryRangeMax, { message: "The top salary must be at least the lowest salary", path: ["salaryRangeMax"] });

export type OpeningInput = z.infer<typeof openingInputSchema>;

type Db = PrismaClient;

const openCount = (db: Pick<PrismaClient, "jobOpening">, companyId: string) => db.jobOpening.count({ where: { companyId, status: "OPEN" } });

async function checkReferences(db: Db, input: OpeningInput) {
  const role = await db.jobRole.findFirst({ where: { id: input.jobRoleId, isActive: true } });
  if (!role) throw new HiringError(400, "INVALID_ROLE", "Choose an active job role.");
  if (input.city) {
    const city = await db.city.findFirst({ where: { name: { equals: input.city, mode: "insensitive" }, isActive: true } });
    if (!city) throw new HiringError(400, "INVALID_CITY", "Choose a city from the list.");
  }
  return role;
}

/** Creates a job opening for the user's company. Open openings count against the plan's limit. */
export async function createOpening(db: Db, args: { userId: string; input: OpeningInput }) {
  const actor = await loadActor(db, args.userId, ["RECRUITER", "COMPANY_ADMIN"]);
  const ent = await getEntitlements(actor.companyId);
  const role = await checkReferences(db, args.input);
  if (args.input.status === "OPEN" && !hasRoom(ent.openingLimit, await openCount(db, actor.companyId))) {
    throw new HiringError(403, "LIMIT_REACHED", ent.openingLimit === 0 ? planBlockMessage(ent, "job openings") : `Your plan allows ${ent.openingLimit} open job openings at a time. Close or fill one, or upgrade your plan.`);
  }
  const opening = await db.jobOpening.create({
    data: { companyId: actor.companyId, createdById: actor.id, jobRoleId: args.input.jobRoleId, title: args.input.title ?? null, city: args.input.city ?? null, salaryRangeMin: args.input.salaryRangeMin, salaryRangeMax: args.input.salaryRangeMax, status: args.input.status },
  });
  await db.auditLog.create({ data: { actorId: actor.id, action: "JOB_OPENING_CREATED", targetType: "JobOpening", targetId: opening.id } });
  if (actor.role === "RECRUITER") {
    const admins = await db.user.findMany({ where: { companyId: actor.companyId, role: "COMPANY_ADMIN", isActive: true }, select: { id: true } });
    for (const a of admins) {
      await notifyUser(db, { userId: a.id, templateKey: "JOB_OPENING_CREATED_IN_APP", type: "GENERAL", values: { recruiterName: actor.name ?? "A recruiter", roleName: role.name }, link: "/company-admin/job-openings" });
    }
  }
  return opening;
}

async function loadOpening(db: Db, actor: { id: string; role: string; companyId: string }, id: string) {
  const opening = await db.jobOpening.findFirst({ where: { id, companyId: actor.companyId, ...(actor.role === "RECRUITER" ? { createdById: actor.id } : {}) } });
  if (!opening) throw new HiringError(404, "NOT_FOUND", "Job opening not found.");
  return opening;
}

/** Edits an opening. Recruiters can edit their own; company admins can edit any in the company. */
export async function updateOpening(db: Db, args: { userId: string; id: string; input: OpeningInput }) {
  const actor = await loadActor(db, args.userId, ["RECRUITER", "COMPANY_ADMIN"]);
  const opening = await loadOpening(db, actor, args.id);
  const ent = await getEntitlements(actor.companyId);
  await checkReferences(db, args.input);
  if (args.input.status === "OPEN" && opening.status !== "OPEN" && !hasRoom(ent.openingLimit, await openCount(db, actor.companyId))) {
    throw new HiringError(403, "LIMIT_REACHED", `Your plan allows ${ent.openingLimit} open job openings at a time. Close or fill one, or upgrade your plan.`);
  }
  const updated = await db.jobOpening.update({
    where: { id: opening.id },
    data: { jobRoleId: args.input.jobRoleId, title: args.input.title ?? null, city: args.input.city ?? null, salaryRangeMin: args.input.salaryRangeMin, salaryRangeMax: args.input.salaryRangeMax, status: args.input.status },
  });
  await db.auditLog.create({ data: { actorId: actor.id, action: "JOB_OPENING_UPDATED", targetType: "JobOpening", targetId: opening.id, metadata: { status: args.input.status } } });
  return updated;
}

/** An opening nobody has shortlisted or contacted anyone for can be deleted; otherwise close it so the history stays. */
export async function deleteOpening(db: Db, args: { userId: string; id: string }) {
  const actor = await loadActor(db, args.userId, ["RECRUITER", "COMPANY_ADMIN"]);
  const opening = await loadOpening(db, actor, args.id);
  const [shortlists, requests] = await Promise.all([db.shortlist.count({ where: { jobOpeningId: opening.id } }), db.contactRequest.count({ where: { jobOpeningId: opening.id } })]);
  if (shortlists > 0 || requests > 0) throw new HiringError(409, "IN_USE", "This job opening has shortlisted candidates or contact requests, so it cannot be deleted. Close it instead.");
  await db.jobOpening.delete({ where: { id: opening.id } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "JOB_OPENING_DELETED", targetType: "JobOpening", targetId: opening.id } });
}
