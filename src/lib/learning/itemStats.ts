import { probCorrect } from "@/lib/testEngine/irt";

/** Pure maths for item analysis. Everything here works on plain numbers so it can be tested without a database. */

export type Point = { theta: number; correct: boolean };

export const A_MIN = 0.2;
export const A_MAX = 3;
export const B_MIN = -4;
export const B_MAX = 4;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * Re-estimates one question's 2PL parameters from the candidates' final ability estimates and whether they
 * answered it correctly: logistic regression P = 1 / (1 + e^-(alpha * theta + beta)), where a = alpha and
 * b = -beta / alpha. A light pull towards the current values (a "prior") keeps a handful of odd answers from
 * throwing the estimate far, and the result is kept inside sensible bounds. Newton-Raphson, at most 50 steps.
 */
export function fitItem(points: Point[], current: { a: number; b: number }): { a: number; b: number; converged: boolean } {
  const lambdaA = 1; // strength of the pull towards the current discrimination
  const lambdaB = 0.25; // ... and towards the current intercept
  const alpha0 = current.a;
  const beta0 = -current.a * current.b;
  let alpha = alpha0;
  let beta = beta0;
  let converged = false;

  for (let step = 0; step < 50; step++) {
    let gA = -lambdaA * (alpha - alpha0);
    let gB = -lambdaB * (beta - beta0);
    let hAA = -lambdaA;
    let hBB = -lambdaB;
    let hAB = 0;
    for (const { theta, correct } of points) {
      const p = 1 / (1 + Math.exp(-(alpha * theta + beta)));
      const r = (correct ? 1 : 0) - p;
      gA += r * theta;
      gB += r;
      const w = p * (1 - p);
      hAA -= w * theta * theta;
      hBB -= w;
      hAB -= w * theta;
    }
    const det = hAA * hBB - hAB * hAB;
    if (Math.abs(det) < 1e-12) break;
    // Newton step: x_new = x - H^-1 g
    const dA = (hBB * gA - hAB * gB) / det;
    const dB = (-hAB * gA + hAA * gB) / det;
    alpha = clamp(alpha - dA, A_MIN, A_MAX);
    beta = clamp(beta - dB, -A_MAX * B_MAX, A_MAX * B_MAX);
    if (Math.abs(dA) < 1e-6 && Math.abs(dB) < 1e-6) {
      converged = true;
      break;
    }
  }
  return { a: round(clamp(alpha, A_MIN, A_MAX)), b: round(clamp(-beta / alpha, B_MIN, B_MAX)), converged };
}

/** Share of candidates who answered correctly (0 to 1); null with no answers. */
export function correctRate(points: Point[]): number | null {
  return points.length ? round(points.filter((p) => p.correct).length / points.length) : null;
}

/**
 * Point-biserial correlation between getting the question right and the candidate's ability: how well the question
 * separates strong candidates from weak ones. Null when everyone (or no one) got it right, or ability does not vary.
 */
export function discrimination(points: Point[]): number | null {
  const n = points.length;
  if (n < 3) return null;
  const right = points.filter((p) => p.correct);
  const wrong = points.filter((p) => !p.correct);
  if (right.length === 0 || wrong.length === 0) return null;
  const mean = (xs: Point[]) => xs.reduce((s, p) => s + p.theta, 0) / xs.length;
  const all = mean(points);
  const sd = Math.sqrt(points.reduce((s, p) => s + (p.theta - all) ** 2, 0) / n);
  if (sd === 0) return null;
  const pr = right.length / n;
  return round(((mean(right) - mean(wrong)) / sd) * Math.sqrt(pr * (1 - pr)));
}

export type GroupPoint = Point & { group: string | null };

/**
 * Differential item functioning (DIF), as the standardised difference in the share correct between a focal group
 * and everyone else, compared only among candidates of similar ability (the sample is cut into ability bands, and
 * each band counts in proportion to the focal group's size there). A positive gap means the focal group does better
 * than equally able others, negative worse. Returns null when the group, or the rest, has fewer than `minGroup`
 * answers, because small groups give noise rather than evidence.
 */
export function difGap(points: GroupPoint[], focal: string, minGroup: number, bands = 5): { gap: number; focalN: number; referenceN: number } | null {
  const focalPts = points.filter((p) => p.group === focal);
  const refPts = points.filter((p) => p.group !== null && p.group !== focal);
  if (focalPts.length < minGroup || refPts.length < minGroup) return null;

  const sorted = [...focalPts, ...refPts].map((p) => p.theta).sort((x, y) => x - y);
  const cuts = Array.from({ length: bands - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / bands)]);
  const bandOf = (theta: number) => cuts.filter((c) => theta >= c).length;

  let weighted = 0;
  let weight = 0;
  for (let b = 0; b < bands; b++) {
    const f = focalPts.filter((p) => bandOf(p.theta) === b);
    const r = refPts.filter((p) => bandOf(p.theta) === b);
    if (f.length === 0 || r.length === 0) continue;
    const pf = f.filter((p) => p.correct).length / f.length;
    const pr = r.filter((p) => p.correct).length / r.length;
    weighted += f.length * (pf - pr);
    weight += f.length;
  }
  if (weight === 0) return null;
  return { gap: round(weighted / weight), focalN: focalPts.length, referenceN: refPts.length };
}

/** The largest gap (by size) over every group that has enough answers, with that group's name. Null if none could be compared. */
export function worstDif(points: GroupPoint[], minGroup: number): { gap: number; group: string } | null {
  let worst: { gap: number; group: string } | null = null;
  for (const group of new Set(points.map((p) => p.group).filter((g): g is string => g !== null))) {
    const r = difGap(points, group, minGroup);
    if (r && (!worst || Math.abs(r.gap) > Math.abs(worst.gap))) worst = { gap: r.gap, group };
  }
  return worst;
}

export type FlagInput = {
  responseCount: number;
  correctRate: number | null;
  discrimination: number | null;
  difByGender: number | null;
  difByRegion: number | null;
  difByLanguage: number | null;
};
export type FlagSettings = { minResponsesForRecalibration: number; tooEasyCorrectRate: number; tooHardCorrectRate: number; minDiscrimination: number; maxDifGap: number };

export type FlagReason = { code: "TOO_EASY" | "TOO_HARD" | "LOW_DISCRIMINATION" | "DIF_GENDER" | "DIF_REGION" | "DIF_LANGUAGE"; text: string };

/** Why a question should go to admin review. Nothing is flagged before it has enough answers. */
export function flagReasons(s: FlagInput, rules: FlagSettings): FlagReason[] {
  if (s.responseCount < rules.minResponsesForRecalibration) return [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const out: FlagReason[] = [];
  if (s.correctRate !== null && s.correctRate > rules.tooEasyCorrectRate) out.push({ code: "TOO_EASY", text: `Too easy: ${pct(s.correctRate)} answer it correctly.` });
  if (s.correctRate !== null && s.correctRate < rules.tooHardCorrectRate) out.push({ code: "TOO_HARD", text: `Too hard: only ${pct(s.correctRate)} answer it correctly.` });
  if (s.discrimination !== null && s.discrimination < rules.minDiscrimination) out.push({ code: "LOW_DISCRIMINATION", text: `Does not separate strong from weak candidates well (${s.discrimination.toFixed(2)}).` });
  const dif: Array<[number | null, FlagReason["code"], string]> = [
    [s.difByGender, "DIF_GENDER", "gender"],
    [s.difByRegion, "DIF_REGION", "region"],
    [s.difByLanguage, "DIF_LANGUAGE", "language"],
  ];
  for (const [gap, code, label] of dif) {
    if (gap !== null && Math.abs(gap) > rules.maxDifGap) out.push({ code, text: `Possible bias by ${label}: equally able candidates differ by ${pct(Math.abs(gap))}.` });
  }
  return out;
}

/** Used by tests and the admin page: how likely a candidate of ability theta is to get an item right under the fitted values. */
export const expectedCorrect = (theta: number, a: number, b: number) => probCorrect(theta, { a, b });
