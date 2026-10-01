import type { PrismaClient } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { recruiterVisibleWhere } from "./candidateAccess";

export class ContactError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ContactError";
  }
}

type Db = Pick<PrismaClient, "user" | "jobOpening" | "candidateProfile" | "contactRequest" | "auditLog" | "notification" | "messageTemplate" | "siteSetting">;

/**
 * A recruiter asks to contact a candidate about one of their company's open job openings.
 * The minimum-salary rule is enforced here, on the server: the offer is the opening's top salary, and the
 * candidate must be a real, consenting account whose minimum fits it. The candidate gets an in-app
 * notification and an email, and accepts or declines from "Recruiter requests".
 */
export async function createContactRequest(
  db: Db,
  args: { recruiterUserId: string; candidateProfileId: string; jobOpeningId: string; message?: string }
) {
  const recruiter = await db.user.findUnique({
    where: { id: args.recruiterUserId },
    select: { id: true, name: true, role: true, isActive: true, companyId: true, company: { select: { name: true } } },
  });
  if (!recruiter?.isActive || !recruiter.companyId || (recruiter.role !== "RECRUITER" && recruiter.role !== "COMPANY_ADMIN")) {
    throw new ContactError(403, "FORBIDDEN", "Only recruiters can contact candidates.");
  }

  const opening = await db.jobOpening.findFirst({ where: { id: args.jobOpeningId, companyId: recruiter.companyId } });
  if (!opening) throw new ContactError(404, "OPENING_NOT_FOUND", "That job opening was not found in your company.");
  if (opening.status !== "OPEN") throw new ContactError(409, "OPENING_CLOSED", "That job opening is not open.");

  // One filter decides who is visible: not anonymised, consent given, and the minimum salary fits the offer.
  const candidate = await db.candidateProfile.findFirst({
    where: { AND: [{ id: args.candidateProfileId }, recruiterVisibleWhere(opening.salaryRangeMax)] },
    select: { id: true, userId: true, user: { select: { name: true } } },
  });
  if (!candidate) throw new ContactError(404, "CANDIDATE_NOT_AVAILABLE", "This candidate is not available for this job opening.");

  const existing = await db.contactRequest.findFirst({ where: { candidateProfileId: candidate.id, jobOpeningId: opening.id } });
  if (existing) {
    throw new ContactError(409, "ALREADY_REQUESTED", existing.status === "SENT" ? "You have already sent this candidate a request for this opening." : "This candidate has already answered a request for this opening.");
  }

  const request = await db.contactRequest.create({
    data: { recruiterId: recruiter.id, candidateProfileId: candidate.id, jobOpeningId: opening.id, message: args.message?.trim() || null },
  });
  await db.auditLog.create({
    data: { actorId: recruiter.id, action: "CONTACT_REQUEST_SENT", targetType: "CandidateProfile", targetId: candidate.id, metadata: { jobOpeningId: opening.id, requestId: request.id } },
  });

  const values = {
    candidateName: candidate.user.name ?? "there",
    recruiterName: recruiter.name ?? "A recruiter",
    companyName: recruiter.company?.name ?? "A company",
  };
  await notifyUser(db, { userId: candidate.userId, templateKey: "CONTACT_REQUEST_RECEIVED_IN_APP", type: "CONTACT_REQUEST", values, link: "/candidate/contact-requests" });
  await notifyUser(db, { userId: candidate.userId, templateKey: "CONTACT_REQUEST_RECEIVED_EMAIL", type: "CONTACT_REQUEST", values, link: "/candidate/contact-requests" });
  return request;
}

/** The candidate accepts or declines a request addressed to them. The recruiter is notified in the app. */
export async function respondToContactRequest(
  db: Db,
  args: { candidateUserId: string; requestId: string; accept: boolean }
) {
  const request = await db.contactRequest.findFirst({
    where: { id: args.requestId, candidateProfile: { userId: args.candidateUserId } },
    include: { candidateProfile: { select: { user: { select: { name: true } } } } },
  });
  if (!request) throw new ContactError(404, "NOT_FOUND", "Request not found.");
  if (request.status !== "SENT") throw new ContactError(409, "ALREADY_ANSWERED", "You have already answered this request.");

  const { count } = await db.contactRequest.updateMany({
    where: { id: request.id, status: "SENT" },
    data: { status: args.accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
  });
  if (count === 0) throw new ContactError(409, "ALREADY_ANSWERED", "You have already answered this request.");
  await db.auditLog.create({
    data: { actorId: args.candidateUserId, action: args.accept ? "CONTACT_REQUEST_ACCEPTED" : "CONTACT_REQUEST_DECLINED", targetType: "ContactRequest", targetId: request.id },
  });
  await notifyUser(db, {
    userId: request.recruiterId,
    templateKey: args.accept ? "CONTACT_REQUEST_ACCEPTED_IN_APP" : "CONTACT_REQUEST_DECLINED_IN_APP",
    type: "CONTACT_REQUEST",
    values: { candidateName: request.candidateProfile.user.name ?? "The candidate" },
    link: "/recruiter/contact-requests",
  });
}
