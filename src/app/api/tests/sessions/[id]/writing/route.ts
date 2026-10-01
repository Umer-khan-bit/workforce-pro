import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { candidateGuard, testErrorResponse } from "@/lib/testEngine/http";
import { submitWriting } from "@/lib/testEngine/session";

// The text is cut to the word limit from Settings on the server; this only stops absurd payloads.
const bodySchema = z.object({ text: z.string().max(20_000), timedOut: z.boolean().optional() });

/** Submits the Language writing task. `timedOut` is set when the page submits automatically at zero. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await candidateGuard();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write your answer first." }, { status: 400 });

  const { id } = await params;
  try {
    return NextResponse.json(await submitWriting({ prisma }, guard.userId, id, parsed.data.text, parsed.data.timedOut ?? false), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return testErrorResponse(err);
  }
}
