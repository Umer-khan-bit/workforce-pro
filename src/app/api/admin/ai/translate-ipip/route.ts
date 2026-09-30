import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { invalidInput } from "@/lib/adminApi";
import { translateIpipBatch } from "@/lib/ai/translate";
import { aiErrorResponse, aiRateLimitResponse } from "@/lib/ai/limits";
import { toAiError } from "@/lib/ai/errors";

const bodySchema = z.object({ languageId: z.string().min(1, "Choose a language") });

/** Translates ONE batch of the IPIP items. The page repeats the call until `remaining` is 0. */
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const limited = aiRateLimitResponse(guard.userId);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const result = await translateIpipBatch({ prisma }, guard.userId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return aiErrorResponse(toAiError(err));
  }
}
