import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { requireStaff, resolveOffer } from "@/lib/recruiter/guards";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { ConcernError, REASON_MAX, reportConcern } from "@/lib/integrity/concerns";

const bodySchema = z.object({
  testType: z.enum(["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"]),
  reason: z.string().trim().min(1, "Write a short reason.").max(REASON_MAX),
  opening: z.string().max(60).nullish(),
  offer: z.number().int().positive().max(100_000_000).nullish(),
});

/**
 * A recruiter reports a concern about a candidate's test result to the platform admins. It follows the same access rules as the
 * candidate report (plan, Top Performer access, minimum salary against the offer). The admins alone decide what happens to the result.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["RECRUITER"]);
  if (staff instanceof NextResponse) return staff;
  const blocked = await requireVerifiedEmail(staff.userId);
  if (blocked) return blocked;
  if (await overLimit(`concern:${staff.userId}`, 20)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;

  const { offerMax } = await resolveOffer(prisma, staff.companyId, { recruiterId: staff.userId, openingId: parsed.data.opening ?? null, offer: parsed.data.offer ?? null });
  if (offerMax === null) return NextResponse.json({ error: "Enter the salary you can offer first.", code: "NO_OFFER" }, { status: 400 });

  try {
    const entitlements = await getEntitlements(staff.companyId);
    const created = await reportConcern(prisma, { recruiterUserId: staff.userId, companyId: staff.companyId, candidateProfileId: id, testType: parsed.data.testType, reason: parsed.data.reason, offerMax, entitlements });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ConcernError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
