import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { invalidInput } from "@/lib/adminApi";
import { generateBatch } from "@/lib/ai/generate";
import { aiErrorResponse, aiRateLimitResponse } from "@/lib/ai/limits";
import { toAiError } from "@/lib/ai/errors";
import { GENERATABLE_TESTS } from "@/lib/ai/prompts";
import { DIFFICULTIES } from "@/lib/questionBank/schema";

const bodySchema = z.object({
  testType: z.enum(GENERATABLE_TESTS),
  jobRoleId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
  languageId: z.string().min(1, "Choose a language"),
  difficulty: z.enum(DIFFICULTIES),
  count: z.coerce.number().int().min(1).max(100),
  focus: z.string().trim().max(200).optional(),
});

/** Generates and reviews ONE batch. The page calls this repeatedly to reach the total it asked for. */
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const limited = aiRateLimitResponse(guard.userId);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const result = await generateBatch({ prisma }, guard.userId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return aiErrorResponse(toAiError(err));
  }
}
