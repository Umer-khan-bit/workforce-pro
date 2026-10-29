import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { requireStaff, resolveOffer } from "@/lib/recruiter/guards";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { getCandidateDetail } from "@/lib/recruiter/candidateDetail";
import { resultLines } from "@/lib/results/describe";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import { buildReportPdf } from "@/lib/results/pdf";

export const dynamic = "force-dynamic";

/**
 * The candidate detail report as a PDF, for a recruiter. It goes through the same access rules as the page
 * (plan, Top Performer access, minimum salary against the offer), is written to the audit log, and leaves out
 * everything private: no minimum salary, phone, email or AI feedback.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["RECRUITER"]);
  if (staff instanceof NextResponse) return staff;
  if (await overLimit(`candidate-report:${staff.userId}`, 60)) return tooManyRequests();
  const { id } = await params;

  const url = new URL(request.url);
  const offerParam = Number(url.searchParams.get("offer"));
  const { offerMax } = await resolveOffer(prisma, staff.companyId, { recruiterId: staff.userId, openingId: url.searchParams.get("opening"), offer: Number.isFinite(offerParam) ? offerParam : null });
  if (offerMax === null) return NextResponse.json({ error: "Enter the salary you can offer first.", code: "NO_OFFER" }, { status: 400 });

  const entitlements = await getEntitlements(staff.companyId);
  const detail = await getCandidateDetail(prisma, { recruiterUserId: staff.userId, companyId: staff.companyId, candidateProfileId: id, offerMax, entitlements });
  if (!detail) return NextResponse.json({ error: "This candidate is not available.", code: "CANDIDATE_NOT_AVAILABLE" }, { status: 404 });

  const [brand, quartiles] = await Promise.all([getSetting("branding"), getSetting("quartiles")]);
  const pdf = await buildReportPdf({
    brandName: brand.name,
    candidateName: detail.name ?? "Candidate",
    jobRole: detail.jobRole,
    city: detail.city,
    experienceYears: detail.experienceYears,
    generatedOn: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    topPerformer: detail.topPerformer,
    results: detail.results.map((r) => ({ title: `${TEST_TITLES[r.testType]} test`, lines: [...resultLines(r, quartiles.minCohortSize), detail.integrity[r.testType]], traits: r.traits, feedback: null, tips: [] })),
    salary: null,
    disclaimer: "Assessment results are a screening aid. AI scores, ranks and recommends; it never makes a hiring decision.",
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="candidate-report.pdf"', "Cache-Control": "no-store" },
  });
}
