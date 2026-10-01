import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setShortlistStatus } from "@/lib/recruiter/shortlist";
import { withApiKey } from "@/lib/ats/v1";

const bodySchema = z.object({ status: z.enum(["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED", "REJECTED"]) });

/** The ATS reports a stage change back (for example "HIRED"). It is recorded like any other change, under the key's creator. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(request, async (caller) => {
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT", issues: parsed.error.flatten() }, { status: 400 });
    await setShortlistStatus(prisma, { actorId: caller.createdById, shortlistId: id, status: parsed.data.status });
    return NextResponse.json({ ok: true, reference: id, status: parsed.data.status });
  });
}
