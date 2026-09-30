import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import { planFeatureUpdateSchema } from "@/lib/plans";

// Only the wording of a feature is editable. New feature keys arrive together with the code that enforces them.
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { key } = await params;
  const parsed = planFeatureUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await prisma.planFeature.update({ where: { key }, data: parsed.data });
    await audit(guard.userId, "PLAN_FEATURE_UPDATED", "PlanFeature", key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
