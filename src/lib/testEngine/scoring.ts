import { IPIP_TRAITS } from "@/lib/questionBank/ipipItems";

/** Likert answers are 1 to 5. A reverse-keyed item is flipped (1 becomes 5, 2 becomes 4, ...). */
export const LIKERT_MIN = 1;
export const LIKERT_MAX = 5;

export function applyKey(value: number, reverseKeyed: boolean): number {
  return reverseKeyed ? LIKERT_MIN + LIKERT_MAX - value : value;
}

export type LikertAnswer = { topic: string | null; reverseKeyed: boolean; value: number };

export type TraitScore = { trait: string; score: number; items: number };

/**
 * Personality: the mean of each Big Five trait on a 1 to 5 scale, after reverse-keying. Because
 * the fifth trait is reported as Emotional Stability (and its worry/mood items are the reverse-keyed
 * ones), a high score always means calmer. Traits with no answers are left out.
 */
export function scorePersonality(answers: LikertAnswer[]): TraitScore[] {
  const scores: TraitScore[] = [];
  for (const trait of IPIP_TRAITS) {
    const mine = answers.filter((a) => a.topic === trait);
    if (mine.length === 0) continue;
    const sum = mine.reduce((total, a) => total + applyKey(a.value, a.reverseKeyed), 0);
    scores.push({ trait, score: round(sum / mine.length, 2), items: mine.length });
  }
  return scores;
}

export type EqAnswer =
  | { kind: "LIKERT"; reverseKeyed: boolean; value: number }
  | { kind: "SJ"; correct: boolean };

/**
 * EQ: 0 to 100. Each Likert item counts (keyed value - 1) / 4, each situational-judgement item
 * counts 1 for the best answer and 0 otherwise; the score is the mean of all items times 100.
 */
export function scoreEq(answers: EqAnswer[]): number {
  if (answers.length === 0) return 0;
  const total = answers.reduce((sum, a) => {
    if (a.kind === "SJ") return sum + (a.correct ? 1 : 0);
    return sum + (applyKey(a.value, a.reverseKeyed) - LIKERT_MIN) / (LIKERT_MAX - LIKERT_MIN);
  }, 0);
  return round((total / answers.length) * 100, 1);
}

export function percentCorrect(correct: number, total: number): number {
  return total === 0 ? 0 : round((correct / total) * 100, 1);
}

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * Language: the multiple-choice ability and the writing grade are combined on the same scale:
 * (1 - w) * theta + w * cefrScore, where w is the writing weight from Settings. Without a writing
 * grade the multiple-choice ability is used on its own.
 */
export function languageComposite(args: {
  theta: number;
  cefr: CefrLevel | null;
  cefrScores: Record<CefrLevel, number>;
  writingWeightPercent: number;
}): number {
  const { theta, cefr, cefrScores, writingWeightPercent } = args;
  if (!cefr) return theta;
  const w = writingWeightPercent / 100;
  return (1 - w) * theta + w * cefrScores[cefr];
}

// ---------- ranking ----------

export type Quartiles = { q1TopPercent: number; q2TopPercent: number; q3TopPercent: number };

/** Percentile rank of `value` within `cohort` (which includes the candidate's own value); ties count half. */
export function percentileRank(value: number, cohort: number[]): number {
  if (cohort.length === 0) return 50;
  const below = cohort.filter((v) => v < value).length;
  const equal = cohort.filter((v) => v === value).length;
  return round(((below + 0.5 * equal) / cohort.length) * 100, 1);
}

/**
 * Quartile from a percentile, using the cut-offs from Settings. Q1 is the top group: a candidate
 * whose "top share" (100 - percentile) is within the first cut-off is Q1, and so on; the rest are Q4.
 */
export function quartileFor(percentile: number, cuts: Quartiles): 1 | 2 | 3 | 4 {
  const top = 100 - percentile;
  if (top <= cuts.q1TopPercent) return 1;
  if (top <= cuts.q2TopPercent) return 2;
  if (top <= cuts.q3TopPercent) return 3;
  return 4;
}

export type CohortChoice = { scope: "ROLE" | "ALL"; values: number[] };

/**
 * Which group the candidate is ranked against: other candidates in the same job role, or all
 * candidates when the role has fewer than `minCohortSize` (counting the candidate themself).
 */
export function chooseCohort(roleValues: number[], allValues: number[], minCohortSize: number): CohortChoice {
  return roleValues.length >= minCohortSize ? { scope: "ROLE", values: roleValues } : { scope: "ALL", values: allValues };
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
