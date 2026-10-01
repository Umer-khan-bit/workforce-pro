import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { HiringError } from "./shortlist";
import { ContactError } from "./contactRequests";
import { BillingError } from "@/lib/subscriptions";

export type Staff = { userId: string; role: "RECRUITER" | "COMPANY_ADMIN"; companyId: string };

/**
 * Role check for recruiter and company-admin API routes: signed in, one of the allowed roles, and attached to
 * a company. Returns who they are, or a ready-made 403.
 */
export async function requireStaff(allowed: Array<"RECRUITER" | "COMPANY_ADMIN">): Promise<Staff | NextResponse> {
  const session = await auth();
  const u = session?.user;
  if (!u || !u.companyId || !allowed.includes(u.role as "RECRUITER" | "COMPANY_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { userId: u.id, role: u.role as Staff["role"], companyId: u.companyId };
}

/** Turns the known hiring/contact/billing errors into their JSON answer; anything else is a real bug and is rethrown. */
export function hiringErrorResponse(err: unknown): NextResponse {
  if (err instanceof HiringError || err instanceof ContactError || err instanceof BillingError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  throw err;
}

/**
 * The offer a recruiter is searching with, which is what the minimum-salary rule is checked against: the top
 * salary of a chosen job opening, or an amount they typed, or (when neither is given) the highest top salary
 * among the company's open job openings. Null means there is no offer yet, so no candidates can be shown.
 */
export async function resolveOffer(db: Pick<PrismaClient, "jobOpening">, companyId: string, args: { openingId?: string | null; offer?: number | null }): Promise<{ offerMax: number | null; openingId: string | null }> {
  if (args.openingId) {
    const opening = await db.jobOpening.findFirst({ where: { id: args.openingId, companyId }, select: { id: true, salaryRangeMax: true } });
    if (opening) return { offerMax: opening.salaryRangeMax, openingId: opening.id };
  }
  if (typeof args.offer === "number" && Number.isFinite(args.offer) && args.offer > 0) return { offerMax: Math.round(args.offer), openingId: null };
  const best = await db.jobOpening.aggregate({ where: { companyId, status: "OPEN" }, _max: { salaryRangeMax: true } });
  return { offerMax: best._max.salaryRangeMax ?? null, openingId: null };
}
