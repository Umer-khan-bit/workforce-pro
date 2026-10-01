import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { ContactError, createContactRequest } from "@/lib/recruiter/contactRequests";

const bodySchema = z.object({
  candidateProfileId: z.string().min(1),
  jobOpeningId: z.string().min(1),
  message: z.string().trim().max(1000).optional(),
});

/**
 * A recruiter (or company admin) asks to contact a candidate about one of their company's job openings.
 * The server enforces the minimum-salary rule, email confirmation and the company's ownership of the opening.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "RECRUITER" && session.user.role !== "COMPANY_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await requireVerifiedEmail(session.user.id);
  if (blocked) return blocked;
  if (await overLimit(`contact:${session.user.id}`, 60)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const created = await createContactRequest(prisma, { recruiterUserId: session.user.id, ...parsed.data });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ContactError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
