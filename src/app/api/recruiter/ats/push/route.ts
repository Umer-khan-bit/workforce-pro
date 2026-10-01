import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError } from "@/lib/ats/apiKeys";
import { pushToAts } from "@/lib/ats/push";

const bodySchema = z.object({ shortlistIds: z.array(z.string().min(1).max(60)).min(1).max(200) });

/** Pushes shortlisted candidates to the company's ATS (the built-in mock ATS in demo mode). */
export async function POST(request: Request) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  if (await overLimit(`ats-push:${staff.userId}`, 60)) return tooManyRequests();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose at least one candidate." }, { status: 400 });
  try {
    return NextResponse.json(await pushToAts(prisma, { userId: staff.userId, shortlistIds: parsed.data.shortlistIds }));
  } catch (err) {
    if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
