import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError, revokeApiKey } from "@/lib/ats/apiKeys";

/** Revokes a key: it stops working at once. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const { id } = await params;
  try {
    await revokeApiKey(prisma, { userId: staff.userId, id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
