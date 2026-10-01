import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";
import { requireCandidate } from "@/lib/candidateApi";
import { latestResults } from "@/lib/results/latest";
import { ensureFeedback } from "@/lib/results/feedback";
import { loadReportData } from "@/lib/results/report";
import { buildReportPdf } from "@/lib/results/pdf";

export const dynamic = "force-dynamic";

// Security rule (stays in code): a report can trigger AI writing, so downloads are capped per candidate.
const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 15 * 60 * 1000;

/**
 * The signed-in candidate's results as a PDF. Feedback that has not been written yet is written first
 * (best effort: if Claude is not available the report simply leaves it out). Only their own data is used.
 */
export async function GET() {
  const guard = await requireCandidate("results");
  if (guard instanceof NextResponse) return guard;
  if (await isRateLimited(`report:${guard.userId}`, REPORT_LIMIT, REPORT_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many downloads. Please wait a few minutes and try again.", code: "RATE_LIMITED" }, { status: 429 });
  }

  const profile = await prisma.candidateProfile.findFirst({ where: { userId: guard.userId, anonymisedAt: null }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const results = (await latestResults(prisma, profile.id)).filter((r) => !r.provisional);
  await Promise.allSettled(results.map((r) => ensureFeedback({ prisma }, guard.userId, r.scoreId)));

  const data = await loadReportData(prisma, guard.userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await buildReportPdf(data);
  await prisma.auditLog.create({ data: { actorId: guard.userId, action: "RESULTS_REPORT_DOWNLOADED", targetType: "CandidateProfile", targetId: profile.id } });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="my-results-report.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
