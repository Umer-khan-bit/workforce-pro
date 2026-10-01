import type { CefrLevel, PrismaClient, TestType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { IPIP_TRAITS } from "../src/lib/questionBank/ipipItems";
import { seededRandom } from "../src/lib/testEngine/rng";
import { CEFR_LEVELS, chooseCohort, languageComposite, percentileRank, quartileFor } from "../src/lib/testEngine/scoring";
import { readSetting } from "../src/lib/settings/store";
import { renderTemplate } from "../src/lib/messageTemplates";
import { meetsTopPerformerRule } from "../src/lib/results/topPerformer";

/**
 * Demo results: realistic COMPLETED test sessions and scores for the demo candidates, spread across the
 * four quartiles, so recruiter filters and dashboards have data. Only runs in demo mode (see seed.ts) and
 * is safe to re-run: a candidate who already has any test session is left untouched.
 *
 * What is and is not created:
 *  - TestSession + Score (+ a graded WritingAssessment for Language) for each test taken, with ranks worked
 *    out the same way the app does it (percentile in the candidate's job role, or all candidates when the
 *    role is small), using the quartile settings in the database.
 *  - NO Response rows: the demo scores are summaries. (Responses would also lock the questions they point
 *    at against editing, and the question bank may not have approved questions yet.)
 *  - The Top Performer badge and an in-app notification for candidates who meet the rule in Settings.
 *  - candidate@demo.test (Ayesha) gets Personality, IQ and EQ only, so Language and Job skill can still be
 *    taken live in a demo.
 */

const DEMO_EMAIL_DOMAIN = "demo.test";
const DEMO_LOGIN = `candidate@${DEMO_EMAIL_DOMAIN}`;
const RANKED: TestType[] = ["IQ", "EQ", "LANGUAGE", "SKILL"];
const DAY = 86_400_000;

const ESSAYS: Record<CefrLevel, { text: string; feedback: string }> = {
  A1: {
    text: "I like work. I am good worker. I come on time every day. I want job in your company please.",
    feedback: "You use simple words clearly. Try adding linking words such as 'because' and 'and' to join your sentences.",
  },
  A2: {
    text: "I would like to work in your team because I am hard working and I learn quickly. In my last job I helped customers every day and I was never late.",
    feedback: "Good, simple connected sentences. Work on using more varied vocabulary and checking verb tenses.",
  },
  B1: {
    text: "In my opinion good communication is the most important skill at work. When I worked in a small office, I always listened carefully to my colleagues, and this helped us finish projects on time.",
    feedback: "A clear and connected answer with a few small errors. Adding more detailed examples would raise it further.",
  },
  B2: {
    text: "Strong communication matters most at work because misunderstandings are costly. In my previous role I made a habit of confirming tasks in writing, which reduced mistakes and made it easier for the team to stay aligned under pressure.",
    feedback: "A detailed, well-organised answer with good control of grammar. A wider range of precise vocabulary would take it to the next level.",
  },
  C1: {
    text: "Effective communication is arguably the foundation of any high-performing team: without it, even talented people duplicate effort or pull in different directions. I therefore make a point of clarifying expectations early and revisiting them whenever priorities shift.",
    feedback: "Fluent and well structured, with flexible use of language and little to correct. Excellent.",
  },
  C2: {
    text: "Communication is less a skill than a discipline: the habit of anticipating how a message will land and adjusting it accordingly. In practice that means being brief when others are stretched, thorough when stakes are high, and candid, yet kind, when something is going wrong.",
    feedback: "Precise, natural and nuanced writing with an excellent command of tone. Outstanding.",
  },
};

/** One normal random number (mean 0, standard deviation 1). */
function normal(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

type Plan = {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  jobRoleId: string | null;
  regionId: string | null;
  tests: Set<TestType>;
  /** Ability per test (a standard-normal-like number). */
  ability: Partial<Record<TestType, number>>;
};

export type DemoResultsSummary = { candidatesSeeded: number; sessions: number; badges: number; quartileCounts: Record<number, number> };

export async function seedDemoResults(prisma: PrismaClient): Promise<DemoResultsSummary> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo results: DEMO_MODE is not 'true'.");

  const [quartiles, testing, topPerformer, configs, defaultLanguage, regionLanguages] = await Promise.all([
    readSetting(prisma, "quartiles"),
    readSetting(prisma, "testing"),
    readSetting(prisma, "topPerformer"),
    prisma.testConfig.findMany(),
    prisma.language.findFirst({ where: { isDefault: true } }),
    prisma.regionLanguage.findMany({ where: { isPrimary: true } }),
  ]);
  const timeLimit = (t: TestType) => configs.find((c) => c.testType === t)?.timeLimitMinutes ?? 15;
  const languageOfRegion = new Map(regionLanguages.map((r) => [r.regionId, r.languageId]));

  const users = await prisma.user.findMany({
    where: { role: "CANDIDATE", email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, candidateProfile: { is: { anonymisedAt: null, testSessions: { none: {} } } } },
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true, candidateProfile: { select: { id: true, jobRoleId: true, regionId: true, experienceYears: true } } },
  });
  if (users.length === 0) return { candidatesSeeded: 0, sessions: 0, badges: 0, quartileCounts: {} };

  // ---- 1. Who takes which test, and how able they are in each.
  const random = seededRandom(20261002);
  const plans: Plan[] = users.map((u, index) => {
    const profile = u.candidateProfile!;
    const isLogin = u.email === DEMO_LOGIN;
    // Roughly one candidate in eleven is a high achiever across the board (so some earn the Top Performer badge).
    const star = !isLogin && index % 11 === 3;
    const general = isLogin ? 0.4 : star ? 1.9 : normal(random) * 0.95 + (profile.experienceYears ?? 0) * 0.04;

    const tests = new Set<TestType>(["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"]);
    if (isLogin) {
      tests.delete("LANGUAGE");
      tests.delete("SKILL");
    } else if (!star) {
      if (index % 9 === 4) tests.delete("SKILL");
      if (index % 13 === 5) tests.delete("LANGUAGE");
    }
    const ability: Plan["ability"] = {};
    for (const t of RANKED) ability[t] = star ? 1.5 + normal(random) * 0.25 : general * 0.65 + normal(random) * 0.75;
    return { profileId: profile.id, userId: u.id, name: u.name ?? u.email, email: u.email, jobRoleId: profile.jobRoleId, regionId: profile.regionId, tests, ability };
  });

  // ---- 2. The numbers each test produces.
  const cefrScores = Object.fromEntries(CEFR_LEVELS.map((l) => [l, testing[`cefrScore${l}` as keyof typeof testing] as number])) as Record<CefrLevel, number>;
  const cefrFor = (theta: number): CefrLevel => CEFR_LEVELS.reduce((best, l) => (Math.abs(cefrScores[l] - theta) < Math.abs(cefrScores[best] - theta) ? l : best), CEFR_LEVELS[0]);

  type Result = { rankValue: number | null; rawScore: number; theta: number | null; se: number | null; items: number; details: Record<string, unknown>; cefr: CefrLevel | null; essay?: { text: string; feedback: string; criteria: Record<string, number> } };
  const results = new Map<string, Result>(); // key = profileId:testType
  const key = (p: Plan, t: TestType) => `${p.profileId}:${t}`;

  for (const p of plans) {
    for (const t of p.tests) {
      const a = p.ability[t] ?? 0;
      if (t === "PERSONALITY") {
        const traits = IPIP_TRAITS.map((trait) => ({ trait, score: round(clamp(3.2 + normal(random) * 0.55, 1.4, 4.8), 2), items: 10 }));
        results.set(key(p, t), { rankValue: null, rawScore: round(traits.reduce((s, x) => s + x.score, 0) / traits.length, 2), theta: null, se: null, items: 50, details: { traits, answered: 50, seeded: true }, cefr: null });
      } else if (t === "EQ") {
        const raw = round(clamp(58 + 13 * a, 25, 98), 1);
        results.set(key(p, t), { rankValue: raw, rawScore: raw, theta: null, se: null, items: 30, details: { answered: 30, likertItems: 20, sjItems: 10, sjCorrect: Math.round((raw / 100) * 10), seeded: true }, cefr: null });
      } else if (t === "LANGUAGE") {
        const mcqTheta = a;
        const cefr = cefrFor(a + normal(random) * 0.3);
        const composite = languageComposite({ theta: mcqTheta, cefr, cefrScores, writingWeightPercent: testing.writingWeightPercent });
        const base = 3 + Math.round(clamp((CEFR_LEVELS.indexOf(cefr) - 1) / 1.5, 0, 2));
        const criteria = { task: clamp(base, 1, 5), coherence: clamp(base, 1, 5), vocabulary: clamp(base - 1 + Math.round(random()), 1, 5), grammar: clamp(base - 1 + Math.round(random()), 1, 5) };
        const correct = clamp(Math.round(55 + 12 * mcqTheta + normal(random) * 4), 25, 97);
        results.set(key(p, t), {
          rankValue: composite,
          rawScore: correct,
          theta: composite,
          se: round(0.27 + random() * 0.07, 2),
          items: 14 + Math.floor(random() * 7),
          details: { answered: 16, correct: Math.round((correct / 100) * 16), pretestShown: 2, mcqTheta, writing: { submitted: true, graded: true, cefr, criteria }, seeded: true },
          cefr,
          essay: { ...ESSAYS[cefr], criteria },
        });
      } else {
        const correct = clamp(Math.round(55 + 12 * a + normal(random) * 4), 25, 97);
        const items = 12 + Math.floor(random() * 9);
        results.set(key(p, t), { rankValue: a, rawScore: correct, theta: a, se: round(0.27 + random() * 0.07, 2), items, details: { answered: items, correct: Math.round((correct / 100) * items), pretestShown: 2, seeded: true }, cefr: null });
      }
    }
  }

  // ---- 3. Rank each ranked test the way the app does (job role cohort, or everyone if the role is small).
  const rankOf = new Map<string, { percentile: number; quartile: 1 | 2 | 3 | 4; scope: "ROLE" | "ALL"; size: number }>();
  for (const t of RANKED) {
    const takers = plans.filter((p) => p.tests.has(t));
    const all = takers.map((p) => results.get(key(p, t))!.rankValue as number);
    for (const p of takers) {
      const value = results.get(key(p, t))!.rankValue as number;
      const role = p.jobRoleId ? takers.filter((o) => o.jobRoleId === p.jobRoleId).map((o) => results.get(key(o, t))!.rankValue as number) : [value];
      const cohort = chooseCohort(role, all, quartiles.minCohortSize);
      const percentile = percentileRank(value, cohort.values);
      rankOf.set(key(p, t), { percentile, quartile: quartileFor(percentile, quartiles), scope: cohort.scope, size: cohort.values.length });
    }
  }

  // ---- 4. Write everything.
  const now = Date.now();
  let sessions = 0;
  let badges = 0;
  const quartileCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const topTemplate = await prisma.messageTemplate.findUnique({ where: { key: "TOP_PERFORMER_IN_APP" } });
  const brand = await readSetting(prisma, "branding");

  for (const [i, p] of plans.entries()) {
    // Tests were taken over the last two months, in the usual order, a few days apart.
    let when = now - (6 + ((i * 7) % 50)) * DAY;
    const quartileByTest: Partial<Record<TestType, number | null>> = {};

    for (const t of ["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"] as TestType[]) {
      if (!p.tests.has(t)) continue;
      const r = results.get(key(p, t))!;
      const rank = rankOf.get(key(p, t));
      const started = new Date(when + Math.floor(random() * 6) * 3_600_000);
      const completed = new Date(started.getTime() + (8 + Math.floor(random() * 7)) * 60_000);
      when += (1 + Math.floor(random() * 3)) * DAY;
      const languageId = t === "PERSONALITY" || t === "EQ" ? null : ((p.regionId && languageOfRegion.get(p.regionId)) || defaultLanguage?.id || null);

      await prisma.$transaction(async (tx) => {
        const session = await tx.testSession.create({
          data: {
            candidateProfileId: p.profileId,
            testType: t,
            languageId,
            status: "COMPLETED",
            theta: r.theta ?? 0,
            standardError: r.se,
            itemsAdministered: r.items,
            resumeState: { phase: "DONE", seeded: true },
            startedAt: started,
            completedAt: completed,
            expiresAt: new Date(started.getTime() + timeLimit(t) * 60_000),
          },
        });
        if (r.essay) {
          await tx.writingAssessment.create({
            data: { sessionId: session.id, essayText: r.essay.text, cefrLevel: r.cefr, rubricScore: r.essay.criteria, feedback: r.essay.feedback, gradedAt: completed },
          });
        }
        await tx.score.create({
          data: {
            candidateProfileId: p.profileId,
            sessionId: session.id,
            testType: t,
            rawScore: r.rawScore,
            theta: r.theta,
            standardError: r.se,
            rankValue: r.rankValue,
            percentile: rank?.percentile ?? null,
            quartile: rank?.quartile ?? null,
            cohortScope: rank?.scope ?? null,
            cohortSize: rank?.size ?? null,
            cefrLevel: r.cefr,
            provisional: false,
            details: r.details as Prisma.InputJsonValue,
            computedAt: completed,
          },
        });
      });
      sessions++;
      if (rank) {
        quartileCounts[rank.quartile]++;
        quartileByTest[t] = rank.quartile;
      }
    }

    // Top Performer badge, by the rule in Settings (no email is sent while seeding).
    if (meetsTopPerformerRule(quartileByTest, topPerformer)) {
      await prisma.badge.upsert({
        where: { candidateProfileId_type: { candidateProfileId: p.profileId, type: "TOP_PERFORMER_ALL_TESTS" } },
        update: {},
        create: { candidateProfileId: p.profileId, type: "TOP_PERFORMER_ALL_TESTS", awardedAt: new Date(now - 2 * DAY), notifiedAt: new Date(now - 2 * DAY) },
      });
      if (topTemplate?.isActive) {
        const values = { brandName: brand.name, candidateName: p.name };
        await prisma.notification.create({
          data: { userId: p.userId, type: "TOP_PERFORMER", channel: "IN_APP", title: renderTemplate(topTemplate.subject, values), message: renderTemplate(topTemplate.body, values), link: "/candidate/badges", sentAt: new Date(now - 2 * DAY) },
        });
      }
      badges++;
    }

    // The demo login also gets a reminder for the two tests she has not taken yet.
    if (p.email === DEMO_LOGIN) {
      const reminder = await prisma.messageTemplate.findUnique({ where: { key: "TEST_REMINDER_IN_APP" } });
      if (reminder?.isActive) {
        for (const testName of ["Language test", "Job skill test"]) {
          const values = { brandName: brand.name, candidateName: p.name, testName };
          await prisma.notification.create({
            data: { userId: p.userId, type: "TEST_REMINDER", channel: "IN_APP", title: renderTemplate(reminder.subject, values), message: renderTemplate(reminder.body, values), link: "/candidate/tests", sentAt: new Date(now - DAY) },
          });
        }
      }
    }
  }

  return { candidatesSeeded: plans.length, sessions, badges, quartileCounts };
}
