import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError } from "@/lib/ats/apiKeys";
import { createApiKey } from "@/lib/ats/apiKeys";

const bodySchema = z.object({ label: z.string().trim().min(1, "Give the key a name").max(60) });

/** A company admin creates a labelled API key. The key itself is in the answer once and never again. */
export async function POST(request: Request) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const created = await createApiKey(prisma, { userId: staff.userId, label: parsed.data.label });
    return NextResponse.json({ id: created.id, key: created.key, prefix: created.prefix }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
