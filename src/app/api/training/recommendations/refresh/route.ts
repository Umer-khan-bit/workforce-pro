import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";
import { requireCandidate } from "@/lib/candidateApi";
import { refreshRecommendations } from "@/lib/training/recommend";

// Security rule (stays in code): recommendations can call the AI, so each candidate is capped.
const REFRESH_LIMIT = 6;
const REFRESH_WINDOW_MS = 15 * 60 * 1000;

/** Works out the signed-in candidate's weak areas and recommends courses (AI, or simple rules as a fallback). */
export async function POST() {
  const guard = await requireCandidate("training");
  if (guard instanceof NextResponse) return guard;
  if (await isRateLimited(`recommend:${guard.userId}`, REFRESH_LIMIT, REFRESH_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again.", code: "RATE_LIMITED" }, { status: 429 });
  }
  const result = await refreshRecommendations({ prisma }, guard.userId);
  return NextResponse.json({ source: result.source, count: result.recommendations.length });
}
