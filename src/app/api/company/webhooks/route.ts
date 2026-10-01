import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError } from "@/lib/ats/apiKeys";
import { createEndpoint } from "@/lib/ats/webhooks";

const bodySchema = z.object({ url: z.string().trim().min(8).max(500), events: z.array(z.string().max(60)).min(1).max(10) });

/** A company admin adds a webhook address. The signing secret is in the answer once and never again. */
export async function POST(request: Request) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a web address and choose at least one event." }, { status: 400 });
  try {
    const created = await createEndpoint(prisma, { userId: staff.userId, ...parsed.data });
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
