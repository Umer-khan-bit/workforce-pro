import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { deleteOpening, openingInputSchema, updateOpening } from "@/lib/recruiter/openings";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  const parsed = openingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  try {
    await updateOpening(prisma, { userId: staff.userId, id, input: parsed.data });
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
    await deleteOpening(prisma, { userId: staff.userId, id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}
