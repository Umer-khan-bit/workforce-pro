import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { bulkApprove } from "@/lib/questionBank/bulkApprove";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one question").max(200),
  includeFlagged: z.boolean().default(false),
});

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const { approvedIds, ...summary } = await bulkApprove(prisma, parsed.data.ids, guard.userId, parsed.data.includeFlagged);
  await audit(guard.userId, "QUESTIONS_BULK_APPROVED", "Question", null, {
    ...summary,
    includeFlagged: parsed.data.includeFlagged,
    ids: approvedIds,
  });
  return NextResponse.json(summary);
}
