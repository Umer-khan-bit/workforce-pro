import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { generateFairnessReport, isMonth } from "@/lib/learning/fairness";

const bodySchema = z.object({ month: z.string().refine(isMonth, "Use a month like 2026-09") });

/** Makes (or remakes) the fairness report for a month. */
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  const report = await generateFairnessReport(prisma, { month: parsed.data.month, actorId: guard.userId });
  await audit(guard.userId, "FAIRNESS_REPORT_GENERATED", "FairnessReport", report.id, { month: parsed.data.month });
  return NextResponse.json({ month: parsed.data.month });
}
