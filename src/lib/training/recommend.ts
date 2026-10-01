import { z } from "zod";
import type { PrismaClient, TestType } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { renderTemplate } from "@/lib/messageTemplates";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "@/lib/ai/claude";
import { estimateCost } from "@/lib/ai/cost";
import { toAiError } from "@/lib/ai/errors";
import { notifyUser } from "@/lib/notifications";
import { latestResults, type LatestResult } from "@/lib/results/latest";
import { TEST_TITLES } from "@/lib/testEngine/labels";

export type WeakArea = { testType: TestType; title: string; quartile: number; percentile: number | null };

/**
 * Weak areas: finished, ranked results at or below the quartile set in Settings > Training, worst first.
 * Personality is never a weak area (it has no better or worse direction).
 */
export function findWeakAreas(results: LatestResult[], weakFromQuartile: number): WeakArea[] {
  return results
    .filter((r) => !r.provisional && r.quartile !== null && r.quartile >= weakFromQuartile && r.testType !== "PERSONALITY")
    .map((r) => ({ testType: r.testType, title: TEST_TITLES[r.testType], quartile: r.quartile as number, percentile: r.percentile }))
    .sort((a, b) => b.quartile - a.quartile || (a.percentile ?? 100) - (b.percentile ?? 100));
}

export type CourseOption = { id: string; title: string; description: string | null; testType: TestType | null; isFree: boolean; price: number };
export type Recommendation = { courseId: string; reason: string };

/** Courses that help with a weak area, worst area first, free before paid. Used when AI is not available. */
export function rankCoursesByRules(courses: CourseOption[], weakAreas: WeakArea[], maxCount: number): Recommendation[] {
  const order = new Map(weakAreas.map((w, i) => [w.testType, i]));
  return courses
    .filter((c) => c.testType !== null && order.has(c.testType))
    .sort((a, b) => order.get(a.testType!)! - order.get(b.testType!)! || Number(b.isFree) - Number(a.isFree) || a.title.localeCompare(b.title))
    .slice(0, maxCount)
    .map((c) => {
      const w = weakAreas[order.get(c.testType!)!];
      return { courseId: c.id, reason: `It targets your ${w.title} result (Q${w.quartile}), one of your weaker areas.` };
    });
}

export const RECOMMENDATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["courseId", "reason"], properties: { courseId: { type: "string" }, reason: { type: "string" } } },
    },
  },
} as const;

const replySchema = z.object({ recommendations: z.array(z.object({ courseId: z.string(), reason: z.string().trim().min(3).max(400) })) });

/** Keeps only courses we offered, once each, up to the limit. (Claude is never trusted with ids it was not given.) */
export function validateRecommendations(raw: { courseId: string; reason: string }[], allowed: Set<string>, maxCount: number): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const r of raw) {
    if (!allowed.has(r.courseId) || seen.has(r.courseId)) continue;
    seen.add(r.courseId);
    out.push({ courseId: r.courseId, reason: r.reason });
    if (out.length >= maxCount) break;
  }
  return out;
}

type Db = PrismaClient;

/** Active courses the candidate could take for a weak area: their job role or general, and not already joined. */
export async function eligibleCourses(db: Db, candidateProfileId: string, jobRoleId: string | null, weakTests: TestType[]): Promise<CourseOption[]> {
  if (weakTests.length === 0) return [];
  const courses = await db.course.findMany({
    where: {
      isActive: true,
      testType: { in: weakTests },
      OR: [{ jobRoleId: null }, ...(jobRoleId ? [{ jobRoleId }] : [])],
      enrollments: { none: { candidateProfileId } },
    },
    select: { id: true, title: true, description: true, testType: true, isFree: true, price: true },
    orderBy: { title: "asc" },
  });
  return courses;
}

export type RecommendationRow = { courseId: string; reason: string; source: string };

export async function loadRecommendations(db: Db, candidateProfileId: string): Promise<RecommendationRow[]> {
  const rows = await db.courseRecommendation.findMany({
    where: { candidateProfileId, course: { isActive: true, enrollments: { none: { candidateProfileId } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ courseId: r.courseId, reason: r.reason, source: r.source }));
}

/** True when there are courses to recommend and the saved recommendations are missing or older than the latest result. */
export async function recommendationsAreStale(db: Db, candidateProfileId: string): Promise<boolean> {
  const profile = await db.candidateProfile.findUnique({ where: { id: candidateProfileId }, select: { jobRoleId: true } });
  if (!profile) return false;
  const [training, results] = await Promise.all([readSetting(db, "training"), latestResults(db, candidateProfileId)]);
  const weak = findWeakAreas(results, training.weakFromQuartile);
  const eligible = await eligibleCourses(db, candidateProfileId, profile.jobRoleId, weak.map((w) => w.testType));
  if (eligible.length === 0) return false;
  const newest = await db.courseRecommendation.findFirst({ where: { candidateProfileId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!newest) return true;
  const latestScoreAt = Math.max(...results.map((r) => r.computedAt.getTime()));
  return latestScoreAt > newest.createdAt.getTime();
}

/**
 * Works out the candidate's weak areas and saves recommended courses. Claude chooses and explains them
 * (prompt and model in Settings); if Claude is not available the simple rules above are used, so the
 * candidate always gets something. Only the weak areas and the course list are sent: no name or contact
 * details. New suggestions create an in-app notification.
 */
export async function refreshRecommendations(
  deps: { prisma: Db; client?: ClaudeClient; useAi?: boolean },
  userId: string
): Promise<{ source: "AI" | "RULES" | "NONE"; recommendations: Recommendation[] }> {
  const { prisma } = deps;
  const profile = await prisma.candidateProfile.findFirst({
    where: { userId, anonymisedAt: null },
    select: { id: true, jobRoleId: true, user: { select: { name: true } } },
  });
  if (!profile) return { source: "NONE", recommendations: [] };

  const [training, results] = await Promise.all([readSetting(prisma, "training"), latestResults(prisma, profile.id)]);
  const weak = findWeakAreas(results, training.weakFromQuartile);
  const courses = await eligibleCourses(prisma, profile.id, profile.jobRoleId, weak.map((w) => w.testType));

  let recommendations: Recommendation[] = [];
  let source: "AI" | "RULES" | "NONE" = "NONE";

  if (courses.length > 0) {
    if (deps.useAi !== false && (deps.client || process.env.ANTHROPIC_API_KEY?.trim())) {
      const [ai, prompts, aiGeneration] = await Promise.all([readSetting(prisma, "aiResults"), readSetting(prisma, "aiPrompts"), readSetting(prisma, "aiGeneration")]);
      const run = await prisma.aiRun.create({ data: { kind: "RECOMMEND", actorId: userId, model: ai.model, reviewModel: ai.model, requested: training.maxRecommendations } });
      try {
        const client = deps.client ?? getClaudeClient();
        const weakText = weak.map((w) => `- ${w.title}: quartile Q${w.quartile} (Q1 is best)${w.percentile !== null ? `, better than ${Math.round(w.percentile)}% of candidates` : ""}`).join("\n");
        const courseText = courses.map((c) => `- ${c.id} | ${c.title} | helps with ${c.testType ? TEST_TITLES[c.testType] : "general skills"} | ${c.isFree ? "free" : `paid (${c.price})`}${c.description ? ` | ${c.description.slice(0, 160)}` : ""}`).join("\n");
        const user = renderTemplate(prompts.recommendationPrompt, { weakAreas: weakText, courses: courseText, maxCount: String(training.maxRecommendations) });
        const reply = await askClaudeJson(client, { model: ai.model, system: prompts.systemPrompt, user, schema: RECOMMENDATION_JSON_SCHEMA, maxTokens: ai.maxOutputTokens, effort: ai.effort });
        const parsed = replySchema.safeParse(reply.data);
        if (parsed.success) recommendations = validateRecommendations(parsed.data.recommendations, new Set(courses.map((c) => c.id)), training.maxRecommendations);
        const cost = estimateCost(reply.usage, aiGeneration.inputPricePerMTok, aiGeneration.outputPricePerMTok);
        await prisma.aiRun.update({ where: { id: run.id }, data: { created: recommendations.length, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, costEstimate: cost, status: "COMPLETED" } });
        if (recommendations.length > 0) source = "AI";
      } catch (err) {
        const aiError = toAiError(err);
        await prisma.aiRun.update({ where: { id: run.id }, data: { status: "FAILED", error: `${aiError.code}: ${aiError.message}` } });
      }
    }
    if (recommendations.length === 0) {
      recommendations = rankCoursesByRules(courses, weak, training.maxRecommendations);
      if (recommendations.length > 0) source = "RULES";
    }
  }

  // Replace the saved list; tell the candidate only about courses that are new to them.
  const before = new Set((await prisma.courseRecommendation.findMany({ where: { candidateProfileId: profile.id }, select: { courseId: true } })).map((r) => r.courseId));
  await prisma.$transaction([
    prisma.courseRecommendation.deleteMany({ where: { candidateProfileId: profile.id } }),
    prisma.courseRecommendation.createMany({ data: recommendations.map((r) => ({ candidateProfileId: profile.id, courseId: r.courseId, reason: r.reason, source })) }),
  ]);
  for (const r of recommendations.filter((x) => !before.has(x.courseId))) {
    const course = courses.find((c) => c.id === r.courseId);
    if (course) {
      await notifyUser(prisma, {
        userId,
        templateKey: "TRAINING_RECOMMENDATION_IN_APP",
        type: "TRAINING_RECOMMENDATION",
        values: { candidateName: profile.user.name ?? "there", courseTitle: course.title },
        link: `/candidate/training/${course.id}`,
      });
    }
  }
  return { source, recommendations };
}
