import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import { planUpdateSchema } from "@/lib/plans";
import { parsePlanFeatures } from "@/lib/planFeatures";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const parsed = planUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const defs = await prisma.planFeature.findMany();
  const features = parsePlanFeatures(defs, parsed.data.features);
  if (!features.ok) return NextResponse.json({ error: features.error }, { status: 400 });

  try {
    await prisma.plan.update({ where: { id }, data: { ...parsed.data, features: features.features } });
    await audit(guard.userId, "PLAN_UPDATED", "Plan", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const inUse = await prisma.subscription.count({ where: { planId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: "Companies have subscribed to this plan. Deactivate it instead." },
      { status: 409 }
    );
  }
  try {
    await prisma.plan.delete({ where: { id } });
    await audit(guard.userId, "PLAN_DELETED", "Plan", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
