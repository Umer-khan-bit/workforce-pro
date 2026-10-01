import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { removeFromShortlist, setShortlistNote, setShortlistStatus } from "@/lib/recruiter/shortlist";

const patchSchema = z
  .object({ status: z.enum(["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED", "REJECTED"]).optional(), note: z.string().max(1000).optional() })
  .refine((v) => v.status !== undefined || v.note !== undefined, { message: "Nothing to change" });

/** Moves a shortlisted candidate to another stage, or edits the note. Recruiters change their own entries; company admins any in the company. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  try {
    if (parsed.data.status) await setShortlistStatus(prisma, { actorId: staff.userId, shortlistId: id, status: parsed.data.status });
    if (parsed.data.note !== undefined) await setShortlistNote(prisma, { actorId: staff.userId, shortlistId: id, note: parsed.data.note });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  try {
    await removeFromShortlist(prisma, { actorId: staff.userId, shortlistId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}
