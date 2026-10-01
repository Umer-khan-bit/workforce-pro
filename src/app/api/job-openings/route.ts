import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { createOpening, openingInputSchema } from "@/lib/recruiter/openings";

/** Recruiters and company admins create job openings for their own company. */
export async function POST(request: Request) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const parsed = openingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const opening = await createOpening(prisma, { userId: staff.userId, input: parsed.data });
    return NextResponse.json({ id: opening.id }, { status: 201 });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}
