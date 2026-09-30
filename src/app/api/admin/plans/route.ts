import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import { planCreateSchema } from "@/lib/plans";
import { parsePlanFeatures } from "@/lib/planFeatures";

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = planCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const defs = await prisma.planFeature.findMany();
  const features = parsePlanFeatures(defs, parsed.data.features);
  if (!features.ok) return NextResponse.json({ error: features.error }, { status: 400 });

  try {
    const plan = await prisma.plan.create({
      data: { ...parsed.data, features: features.features },
      select: { id: true },
    });
    await audit(guard.userId, "PLAN_CREATED", "Plan", plan.id, { code: parsed.data.code });
    return NextResponse.json({ id: plan.id }, { status: 201 });
  } catch (err) {
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
