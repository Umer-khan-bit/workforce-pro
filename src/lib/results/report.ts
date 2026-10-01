import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { formatMoney } from "@/lib/money";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import { resultLines } from "./describe";
import { findFeedback } from "./feedback";
import { latestResults } from "./latest";
import type { ReportData } from "./pdf";
import { loadSalaryGuide } from "@/lib/salary/guide";

type Db = Pick<
  PrismaClient,
  "user" | "candidateProfile" | "score" | "aIFeedback" | "badge" | "siteSetting" | "experienceBand" | "salaryBenchmark"
>;

/** Collects what the PDF shows for one candidate. Feedback is included only if it has already been written. */
export async function loadReportData(db: Db, userId: string, now = new Date()): Promise<ReportData | null> {
  const profile = await db.candidateProfile.findFirst({
    where: { userId, anonymisedAt: null },
    select: { id: true, city: true, experienceYears: true, jobRole: { select: { name: true } }, user: { select: { name: true, email: true } } },
  });
  if (!profile) return null;

  const [brand, quartiles, currency, results, badge, guide] = await Promise.all([
    readSetting(db, "branding"),
    readSetting(db, "quartiles"),
    readSetting(db, "currency"),
    latestResults(db, profile.id),
    db.badge.count({ where: { candidateProfileId: profile.id, type: "TOP_PERFORMER_ALL_TESTS" } }),
    loadSalaryGuide(db, profile.id),
  ]);

  const reportResults = [];
  for (const r of results) {
    const fb = r.provisional ? null : await findFeedback(db, r.scoreId);
    reportResults.push({
      title: `${TEST_TITLES[r.testType]} test`,
      lines: resultLines(r, quartiles.minCohortSize),
      traits: r.traits,
      feedback: fb?.text ?? null,
      tips: fb?.tips ?? [],
    });
  }

  let salary: ReportData["salary"] = null;
  let disclaimer: string | null = null;
  if (guide.status === "OK") {
    const money = (n: number) => formatMoney(n, currency);
    salary = {
      currency: currency.code,
      suggestedLine: `Suggested monthly range: ${money(guide.numbers.suggestedMin)} to ${money(guide.numbers.suggestedMax)}`,
      marketLine: `Market range for ${guide.roleName} in ${guide.allCitiesFallback ? "all cities" : guide.city} (${guide.bandLabel}): ${money(guide.market.min)} to ${money(guide.market.max)}, average ${money(guide.market.avg)}`,
      basis: guide.usedTests.length > 0 ? `Based on your results in ${guide.usedTests.map((t) => TEST_TITLES[t.testType]).join(", ")}.` : "Based on the market range only; complete more assessments to personalise it.",
    };
    disclaimer = guide.disclaimer;
  }

  return {
    brandName: brand.name,
    candidateName: profile.user.name ?? profile.user.email,
    jobRole: profile.jobRole?.name ?? null,
    city: profile.city,
    experienceYears: profile.experienceYears,
    generatedOn: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    topPerformer: badge > 0,
    results: reportResults,
    salary,
    disclaimer,
  };
}
