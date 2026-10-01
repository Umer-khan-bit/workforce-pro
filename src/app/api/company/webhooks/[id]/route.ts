import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError } from "@/lib/ats/apiKeys";
import { deleteEndpoint, updateEndpoint } from "@/lib/ats/webhooks";

const patchSchema = z
  .object({ isActive: z.boolean().optional(), events: z.array(z.string().max(60)).max(10).optional() })
  .refine((v) => v.isActive !== undefined || v.events !== undefined, { message: "Nothing to change" });

const fail = (err: unknown) => {
  if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  throw err;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await updateEndpoint(prisma, { userId: staff.userId, id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  try {
    await deleteEndpoint(prisma, { userId: staff.userId, id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
