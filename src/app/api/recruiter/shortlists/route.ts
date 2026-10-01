import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { addToShortlist } from "@/lib/recruiter/shortlist";
import { overLimit, tooManyRequests } from "@/lib/authLimits";

const bodySchema = z.object({ candidateProfileId: z.string().min(1), jobOpeningId: z.string().min(1), note: z.string().trim().max(1000).optional() });

/** A recruiter puts a candidate on their shortlist for one of the company job openings. */
export async function POST(request: Request) {
  const staff = await requireStaff(["RECRUITER"]);
  if (staff instanceof NextResponse) return staff;
  if (await overLimit(`shortlist:${staff.userId}`, 120)) return tooManyRequests();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const entry = await addToShortlist(prisma, { recruiterId: staff.userId, ...parsed.data });
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}
