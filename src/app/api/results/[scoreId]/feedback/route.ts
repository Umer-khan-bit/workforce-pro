import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";
import { requireCandidate } from "@/lib/candidateApi";
import { ensureFeedback } from "@/lib/results/feedback";
import { AiError, toAiError } from "@/lib/ai/errors";
import { aiErrorResponse } from "@/lib/ai/limits";

// Security rule (stays in code): writing feedback costs money, so each candidate is capped.
const FEEDBACK_LIMIT = 12;
const FEEDBACK_WINDOW_MS = 15 * 60 * 1000;

/** The AI feedback and improvement tips for one of the signed-in candidate's results (written once, then saved). */
export async function POST(_request: Request, { params }: { params: Promise<{ scoreId: string }> }) {
  const guard = await requireCandidate("results");
  if (guard instanceof NextResponse) return guard;
  const { scoreId } = await params;

  // Already written: just return it, without counting against the AI allowance.
  const existing = await prisma.aIFeedback.findFirst({ where: { scoreId, candidateProfile: { userId: guard.userId } } });
  if (!existing && (await isRateLimited(`feedback:${guard.userId}`, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS))) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again.", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const feedback = await ensureFeedback({ prisma }, guard.userId, scoreId);
    return NextResponse.json({ feedback: { text: feedback.text, tips: feedback.tips, cached: feedback.cached } });
  } catch (err) {
    const aiError = toAiError(err);
    if (aiError instanceof AiError && aiError.code === "INVALID_INPUT") return NextResponse.json({ error: aiError.message, code: aiError.code }, { status: 404 });
    // Setup problems (key, credit, model) are for the admin: candidates just see that it is unavailable for now.
    const adminOnly = ["NO_API_KEY", "BAD_API_KEY", "NO_CREDIT", "BAD_MODEL", "BAD_REQUEST"].includes(aiError.code);
    if (adminOnly) return NextResponse.json({ error: "Feedback is not available right now. Please try again later.", code: "UNAVAILABLE" }, { status: 503 });
    return aiErrorResponse(aiError);
  }
}
