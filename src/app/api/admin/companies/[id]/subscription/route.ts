import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { invalidInput } from "@/lib/adminApi";
import { assignPlan, BillingError } from "@/lib/subscriptions";

const bodySchema = z.object({ planCode: z.string().min(1).max(60), days: z.coerce.number().int().min(1).max(3650) });

/** Platform admin gives a company a plan for a number of days without a payment (a pilot, a goodwill extension, a manual sale). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const subscription = await assignPlan(prisma, { actorId: guard.userId, companyId: id, ...parsed.data });
    return NextResponse.json({ subscriptionId: subscription.id }, { status: 201 });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
