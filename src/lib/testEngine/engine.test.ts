import { describe, expect, it } from "vitest";
import { estimateAbility, itemInformation, probCorrect, type ScoredAnswer } from "./irt";
import { exposureRate, pretestPositions, selectNextItem, shouldStop, type CatItem, type SelectionSettings } from "./cat";
import { buildFixedForm } from "./fixedForm";
import { seededRandom, shuffle } from "./rng";
import {
  CEFR_LEVELS,
  applyKey,
  chooseCohort,
  languageComposite,
  percentCorrect,
  percentileRank,
  quartileFor,
  scoreEq,
  scorePersonality,
  type CefrLevel,
  type LikertAnswer,
} from "./scoring";
import { IPIP_50_ITEMS, IPIP_TRAITS } from "@/lib/questionBank/ipipItems";
import { DEFAULT_SETTINGS } from "@/lib/settings/definitions";

describe("IRT 2PL", () => {
  it("gives a 50% chance when ability equals difficulty, whatever the discrimination", () => {
    expect(probCorrect(0.7, { a: 1, b: 0.7 })).toBeCloseTo(0.5, 10);
    expect(probCorrect(-1.2, { a: 2.5, b: -1.2 })).toBeCloseTo(0.5, 10);
  });

  it("follows the logistic curve", () => {
    expect(probCorrect(1, { a: 2, b: 0 })).toBeCloseTo(1 / (1 + Math.exp(-2)), 10);
    expect(probCorrect(-3, { a: 1, b: 0 })).toBeLessThan(0.05);
    expect(probCorrect(3, { a: 1, b: 0 })).toBeGreaterThan(0.95);
  });

  it("information peaks at the item's difficulty and equals a^2 / 4 there", () => {
    const item = { a: 1.5, b: 0.4 };
    expect(itemInformation(0.4, item)).toBeCloseTo((1.5 * 1.5) / 4, 10);
    expect(itemInformation(0.4, item)).toBeGreaterThan(itemInformation(1.4, item));
    expect(itemInformation(0.4, item)).toBeGreaterThan(itemInformation(-0.6, item));
  });

  it("a sharper item is more informative than a blunt one at the same spot", () => {
    expect(itemInformation(0, { a: 2, b: 0 })).toBeGreaterThan(itemInformation(0, { a: 1, b: 0 }));
  });
});

describe("EAP ability estimate", () => {
  // Independent reference: the same posterior integrated on a much finer grid.
  function reference(answers: ScoredAnswer[]) {
    let num = 0;
    let den = 0;
    const pts: Array<[number, number]> = [];
    for (let t = -6; t <= 6; t += 0.005) {
      let w = Math.exp(-0.5 * t * t);
      for (const a of answers) w *= a.correct ? probCorrect(t, a) : 1 - probCorrect(t, a);
      pts.push([t, w]);
      num += w * t;
      den += w;
    }
    const mean = num / den;
    const variance = pts.reduce((s, [t, w]) => s + w * (t - mean) ** 2, 0) / den;
    return { theta: mean, se: Math.sqrt(variance) };
  }

  it("starts at the prior: theta 0 and standard error about 1 before any answer", () => {
    const { theta, se } = estimateAbility([]);
    expect(theta).toBeCloseTo(0, 6);
    expect(se).toBeGreaterThan(0.98);
    expect(se).toBeLessThanOrEqual(1);
  });

  it("matches an independent high-resolution calculation", () => {
    const answers: ScoredAnswer[] = [
      { a: 1, b: 0, correct: true },
      { a: 1.3, b: 0.5, correct: true },
      { a: 0.8, b: 1, correct: false },
      { a: 1, b: -1, correct: true },
      { a: 1.6, b: 0.2, correct: false },
    ];
    const got = estimateAbility(answers);
    const want = reference(answers);
    expect(got.theta).toBeCloseTo(want.theta, 2);
    expect(got.se).toBeCloseTo(want.se, 2);
  });

  it("goes up after right answers, down after wrong ones, symmetrically for a symmetric test", () => {
    const right = estimateAbility([{ a: 1, b: 0, correct: true }]);
    const wrong = estimateAbility([{ a: 1, b: 0, correct: false }]);
    expect(right.theta).toBeGreaterThan(0);
    expect(wrong.theta).toBeLessThan(0);
    expect(right.theta).toBeCloseTo(-wrong.theta, 6);
  });

  it("is higher when the right answers were on harder questions", () => {
    const easy = estimateAbility([{ a: 1, b: -1, correct: true }]);
    const hard = estimateAbility([{ a: 1, b: 1, correct: true }]);
    expect(hard.theta).toBeGreaterThan(easy.theta);
  });

  it("the standard error shrinks as informative answers accumulate", () => {
    const answers: ScoredAnswer[] = [];
    let previous = estimateAbility(answers).se;
    for (let i = 0; i < 12; i++) {
      answers.push({ a: 1.2, b: (i % 3) - 1, correct: i % 2 === 0 });
      const { se } = estimateAbility(answers);
      expect(se).toBeLessThan(previous);
      previous = se;
    }
    expect(previous).toBeLessThan(0.6);
  });

  it("stays inside the grid and finite, even for a perfect or zero score", () => {
    const perfect = estimateAbility(Array.from({ length: 20 }, () => ({ a: 1.5, b: 0, correct: true })));
    const zero = estimateAbility(Array.from({ length: 20 }, () => ({ a: 1.5, b: 0, correct: false })));
    expect(perfect.theta).toBeLessThan(4);
    expect(zero.theta).toBeGreaterThan(-4);
    expect(Number.isFinite(perfect.se)).toBe(true);
  });
});

describe("stopping rule", () => {
  const base = { minItems: 10, maxItems: 20, seThreshold: 0.35 };

  it("never stops before the minimum number of items, however precise", () => {
    expect(shouldStop({ ...base, scoredCount: 9, standardError: 0.1 })).toBe(false);
  });

  it("stops once the standard error is below the threshold at or after the minimum", () => {
    expect(shouldStop({ ...base, scoredCount: 10, standardError: 0.34 })).toBe(true);
    expect(shouldStop({ ...base, scoredCount: 14, standardError: 0.3 })).toBe(true);
  });

  it("keeps going while the error is at or above the threshold", () => {
    expect(shouldStop({ ...base, scoredCount: 12, standardError: 0.35 })).toBe(false);
    expect(shouldStop({ ...base, scoredCount: 15, standardError: 0.5 })).toBe(false);
  });

  it("always stops at the maximum", () => {
    expect(shouldStop({ ...base, scoredCount: 20, standardError: 0.9 })).toBe(true);
  });

  it("uses whatever limits it is given (they come from the test settings)", () => {
    expect(shouldStop({ minItems: 5, maxItems: 8, seThreshold: 0.5, scoredCount: 5, standardError: 0.49 })).toBe(true);
    expect(shouldStop({ minItems: 5, maxItems: 8, seThreshold: 0.5, scoredCount: 8, standardError: 0.99 })).toBe(true);
  });
});

describe("item selection", () => {
  const settings: SelectionSettings = { topK: 1, maxExposureRate: 1, topicBalancePenalty: 0 };
  const rand = () => 0;
  type Spec = [string, number, number] | [string, number, number, string | null] | [string, number, number, string | null, number];
  const items = (specs: Spec[]): CatItem[] =>
    specs.map(([id, a, b, topic = null, exposure = 0]) => ({ id, a, b, topic, exposure }));

  it("picks the item with maximum information at the current ability", () => {
    const pool = items([["easy", 1, -1], ["mid", 1, 0], ["hard", 1, 1]]);
    expect(selectNextItem({ theta: 0.9, pool, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!.id).toBe("hard");
    expect(selectNextItem({ theta: -1.1, pool, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!.id).toBe("easy");
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!.id).toBe("mid");
  });

  it("prefers a sharper item when difficulty is equally close", () => {
    const pool = items([["blunt", 0.8, 0], ["sharp", 2, 0]]);
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!.id).toBe("sharp");
  });

  it("never repeats a question, and returns null when none are left", () => {
    const pool = items([["a", 1, 0], ["b", 1, 0.1]]);
    const first = selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!;
    const second = selectNextItem({ theta: 0, pool, seenIds: new Set([first.id]), servedTopics: new Map(), settings, random: rand })!;
    expect(second.id).not.toBe(first.id);
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(["a", "b"]), servedTopics: new Map(), settings, random: rand })).toBeNull();
  });

  it("balances topics: a topic already used loses to an equally good item from a new topic", () => {
    const pool = items([["algebra", 1, 0, "algebra"], ["verbal", 1, 0.01, "verbal"]]);
    const balanced = { ...settings, topicBalancePenalty: 0.5 };
    const used = new Map([["verbal", 3]]);
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: used, settings: balanced, random: rand })!.id).toBe("algebra");
    // With the penalty off, the marginally better item wins regardless of topic.
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: used, settings, random: rand })!.id).toBe("algebra");
    expect(selectNextItem({ theta: 0.02, pool, seenIds: new Set(), servedTopics: used, settings, random: rand })!.id).toBe("verbal");
  });

  it("skips over-exposed items while enough alternatives remain", () => {
    const pool = items([["best", 2, 0, null, 0.9], ["ok1", 1, 0.1, null, 0.1], ["ok2", 1, -0.1, null, 0.1]]);
    const capped = { topK: 2, maxExposureRate: 0.4, topicBalancePenalty: 0 };
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) picks.add(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings: capped, random: seededRandom(i) })!.id);
    expect(picks.has("best")).toBe(false);
  });

  it("uses over-exposed items when skipping them would leave too few choices", () => {
    const pool = items([["best", 2, 0, null, 0.9], ["ok", 1, 0.1, null, 0.1]]);
    const capped = { topK: 2, maxExposureRate: 0.4, topicBalancePenalty: 0 };
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) picks.add(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings: capped, random: seededRandom(i) })!.id);
    expect(picks.has("best")).toBe(true);
  });

  it("chooses at random only among the top K, and is repeatable with the same seed", () => {
    const pool = items([["a", 1, 0], ["b", 1, 0.05], ["c", 1, -0.05], ["far1", 1, 2.5], ["far2", 1, -2.5]]);
    const top3 = { topK: 3, maxExposureRate: 1, topicBalancePenalty: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) seen.add(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings: top3, random: seededRandom(i) })!.id);
    expect([...seen].sort()).toEqual(["a", "b", "c"]);

    const again = () => selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings: top3, random: seededRandom(42) })!.id;
    expect(again()).toBe(again());
  });

  it("does not depend on the order the database returned the items in", () => {
    const pool = items([["a", 1, 0], ["b", 1, 0], ["c", 1, 0]]);
    const pick = (p: CatItem[]) => selectNextItem({ theta: 0, pool: p, seenIds: new Set(), servedTopics: new Map(), settings, random: rand })!.id;
    expect(pick(pool)).toBe(pick([...pool].reverse()));
  });

  it("works with the starting values from Settings", () => {
    const { topK, maxExposureRate, topicBalancePenalty } = DEFAULT_SETTINGS.testEngine;
    const pool = items([["a", 1, 0], ["b", 1, 0.2]]);
    expect(selectNextItem({ theta: 0, pool, seenIds: new Set(), servedTopics: new Map(), settings: { topK, maxExposureRate, topicBalancePenalty }, random: rand })).not.toBeNull();
  });
});

describe("exposure and pretest placement", () => {
  it("measures exposure against tests taken, with a warm-up floor", () => {
    expect(exposureRate(10, 100, 30)).toBeCloseTo(0.1);
    expect(exposureRate(5, 5, 30)).toBeCloseTo(5 / 30); // early on, not over-restricted
    expect(exposureRate(0, 0, 0)).toBe(0);
  });

  it("puts pretest items at distinct positions inside the first minItems, never first", () => {
    for (let seed = 0; seed < 50; seed++) {
      const slots = pretestPositions(2, 10, seededRandom(seed));
      expect(slots).toHaveLength(2);
      expect(new Set(slots).size).toBe(2);
      expect(slots.every((s) => s >= 1 && s <= 11)).toBe(true);
      expect(slots).toEqual([...slots].sort((a, b) => a - b));
    }
    expect(pretestPositions(0, 10, seededRandom(1))).toEqual([]);
  });

  it("is repeatable for the same seed", () => {
    expect(pretestPositions(2, 10, seededRandom(7))).toEqual(pretestPositions(2, 10, seededRandom(7)));
  });
});

describe("fixed-length forms (Personality, EQ)", () => {
  const topics = ["A", "B", "C", "D", "E"];
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, topic: topics[i % 5] }));

  it("serves every item when the form is as long as the pool, with no repeats", () => {
    const form = buildFixedForm(items, 50, seededRandom(1));
    expect(form).toHaveLength(50);
    expect(new Set(form).size).toBe(50);
  });

  it("stays balanced across topics when it has to choose", () => {
    const form = buildFixedForm(items, 20, seededRandom(3));
    const counts = topics.map((t) => form.filter((id) => items.find((i) => i.id === id)!.topic === t).length);
    expect(counts).toEqual([4, 4, 4, 4, 4]);
  });

  it("is repeatable for a seed (so resume keeps the order) and differs between seeds", () => {
    expect(buildFixedForm(items, 50, seededRandom(9))).toEqual(buildFixedForm(items, 50, seededRandom(9)));
    expect(buildFixedForm(items, 50, seededRandom(9))).not.toEqual(buildFixedForm(items, 50, seededRandom(10)));
  });

  it("copes with a pool smaller than the request and with missing topics", () => {
    expect(buildFixedForm(items.slice(0, 7), 50, seededRandom(1))).toHaveLength(7);
    expect(buildFixedForm([{ id: "x", topic: null }, { id: "y", topic: null }], 2, seededRandom(1)).sort()).toEqual(["x", "y"]);
  });

  it("shuffle returns a permutation and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRandom(5));
    expect(out.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("reverse-keying", () => {
  it("flips 1-5 to 5-1 only for reverse-keyed items", () => {
    expect([1, 2, 3, 4, 5].map((v) => applyKey(v, true))).toEqual([5, 4, 3, 2, 1]);
    expect([1, 2, 3, 4, 5].map((v) => applyKey(v, false))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("personality scoring (toward stability)", () => {
  const answerAll = (valueFor: (reverse: boolean) => number): LikertAnswer[] =>
    IPIP_50_ITEMS.map((i) => ({ topic: i.trait, reverseKeyed: i.reverse, value: valueFor(i.reverse) }));

  it("an ideal respondent (agrees with positive items, disagrees with reversed ones) scores 5 on every trait", () => {
    const scores = scorePersonality(answerAll((reverse) => (reverse ? 1 : 5)));
    expect(scores.map((s) => s.trait)).toEqual([...IPIP_TRAITS]);
    for (const s of scores) expect(s.score).toBe(5);
  });

  it("the opposite respondent scores 1 on every trait", () => {
    for (const s of scorePersonality(answerAll((reverse) => (reverse ? 5 : 1)))) expect(s.score).toBe(1);
  });

  it("agreeing with every statement gives the exact mix the reverse-keyed counts predict", () => {
    const byTrait = Object.fromEntries(scorePersonality(answerAll(() => 5)).map((s) => [s.trait, s.score]));
    // (non-reversed * 5 + reversed * 1) / 10 for each trait
    expect(byTrait["Extraversion"]).toBe(3); // 5 reversed of 10
    expect(byTrait["Agreeableness"]).toBe(3.4); // 4 reversed
    expect(byTrait["Conscientiousness"]).toBe(3.4); // 4 reversed
    expect(byTrait["Openness"]).toBe(3.8); // 3 reversed
    // 8 reversed: someone who says yes to worry and mood swings scores LOW on stability.
    expect(byTrait["Emotional Stability"]).toBe(1.8);
  });

  it("a calm respondent (disagrees with all 8 worry and mood items) scores high on Emotional Stability", () => {
    const stability = IPIP_50_ITEMS.filter((i) => i.trait === "Emotional Stability");
    expect(stability.filter((i) => i.reverse)).toHaveLength(8);
    const calm = stability.map((i) => ({ topic: i.trait, reverseKeyed: i.reverse, value: i.reverse ? 1 : 5 }));
    expect(scorePersonality(calm)[0]).toMatchObject({ trait: "Emotional Stability", score: 5, items: 10 });
    const anxious = stability.map((i) => ({ topic: i.trait, reverseKeyed: i.reverse, value: i.reverse ? 5 : 1 }));
    expect(scorePersonality(anxious)[0].score).toBe(1);
  });

  it("averages partial answers and leaves out traits with none", () => {
    const scores = scorePersonality([
      { topic: "Openness", reverseKeyed: false, value: 4 },
      { topic: "Openness", reverseKeyed: true, value: 4 }, // counts as 2
    ]);
    expect(scores).toEqual([{ trait: "Openness", score: 3, items: 2 }]);
  });
});

describe("EQ scoring", () => {
  it("combines Likert (keyed) and situational-judgement items into 0-100", () => {
    expect(scoreEq([])).toBe(0);
    expect(scoreEq([{ kind: "SJ", correct: true }, { kind: "SJ", correct: true }])).toBe(100);
    expect(scoreEq([{ kind: "SJ", correct: false }, { kind: "LIKERT", reverseKeyed: false, value: 1 }])).toBe(0);
    // Likert 5 counts 1, Likert 3 counts 0.5, SJ wrong counts 0 -> mean 0.5
    expect(scoreEq([{ kind: "LIKERT", reverseKeyed: false, value: 5 }, { kind: "LIKERT", reverseKeyed: false, value: 3 }, { kind: "SJ", correct: false }, { kind: "SJ", correct: true }])).toBe(62.5);
  });

  it("reverse-keys EQ Likert statements", () => {
    expect(scoreEq([{ kind: "LIKERT", reverseKeyed: true, value: 1 }])).toBe(100);
    expect(scoreEq([{ kind: "LIKERT", reverseKeyed: true, value: 5 }])).toBe(0);
  });

  it("percent correct handles an empty test", () => {
    expect(percentCorrect(7, 10)).toBe(70);
    expect(percentCorrect(0, 0)).toBe(0);
  });
});

describe("Language composite", () => {
  const { writingWeightPercent, cefrScoreA1, cefrScoreA2, cefrScoreB1, cefrScoreB2, cefrScoreC1, cefrScoreC2 } = DEFAULT_SETTINGS.testing;
  const cefrScores: Record<CefrLevel, number> = { A1: cefrScoreA1, A2: cefrScoreA2, B1: cefrScoreB1, B2: cefrScoreB2, C1: cefrScoreC1, C2: cefrScoreC2 };

  it("starts with 30% writing", () => {
    expect(writingWeightPercent).toBe(30);
  });

  it("blends the multiple-choice ability and the writing grade by the configured weight", () => {
    expect(languageComposite({ theta: 1, cefr: "B2", cefrScores, writingWeightPercent: 30 })).toBeCloseTo(0.7 * 1 + 0.3 * 0.4, 10);
    expect(languageComposite({ theta: 1, cefr: "C2", cefrScores, writingWeightPercent: 0 })).toBe(1);
    expect(languageComposite({ theta: 1, cefr: "A1", cefrScores, writingWeightPercent: 100 })).toBe(cefrScoreA1);
  });

  it("uses the multiple-choice ability alone when there is no writing grade", () => {
    expect(languageComposite({ theta: -0.3, cefr: null, cefrScores, writingWeightPercent: 30 })).toBe(-0.3);
  });

  it("a better writing grade never lowers the score, and the scale rises from A1 to C2", () => {
    const scores = CEFR_LEVELS.map((l) => languageComposite({ theta: 0, cefr: l, cefrScores, writingWeightPercent: 30 }));
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});

describe("percentile and quartile", () => {
  const cuts = { q1TopPercent: 25, q2TopPercent: 50, q3TopPercent: 75 };

  it("ranks a value within its cohort, counting ties as half", () => {
    const cohort = [1, 2, 3, 4, 5];
    expect(percentileRank(5, cohort)).toBe(90); // 4 below + half of itself
    expect(percentileRank(1, cohort)).toBe(10);
    expect(percentileRank(3, cohort)).toBe(50);
    expect(percentileRank(2, [2, 2, 2, 2])).toBe(50);
    expect(percentileRank(1, [1])).toBe(50);
    expect(percentileRank(0, [])).toBe(50);
  });

  it("puts the top quarter in Q1 and so on, with the boundaries on the better side", () => {
    expect(quartileFor(100, cuts)).toBe(1);
    expect(quartileFor(75, cuts)).toBe(1);
    expect(quartileFor(74.9, cuts)).toBe(2);
    expect(quartileFor(50, cuts)).toBe(2);
    expect(quartileFor(49.9, cuts)).toBe(3);
    expect(quartileFor(25, cuts)).toBe(3);
    expect(quartileFor(24.9, cuts)).toBe(4);
    expect(quartileFor(0, cuts)).toBe(4);
  });

  it("uses the cut-offs from Settings, not fixed quarters", () => {
    const strict = { q1TopPercent: 10, q2TopPercent: 30, q3TopPercent: 60 };
    expect(quartileFor(89, strict)).toBe(2);
    expect(quartileFor(91, strict)).toBe(1);
    expect(quartileFor(45, strict)).toBe(3);
    expect(quartileFor(39, strict)).toBe(4);
  });

  it("splits a large cohort into the expected groups", () => {
    const cohort = Array.from({ length: 100 }, (_, i) => i);
    const counts = [0, 0, 0, 0];
    for (const v of cohort) counts[quartileFor(percentileRank(v, cohort), cuts) - 1]++;
    expect(counts).toEqual([25, 25, 25, 25]);
  });

  it("ranks against the job role when it is big enough, otherwise against everyone", () => {
    const role = Array.from({ length: 30 }, (_, i) => i);
    const all = Array.from({ length: 200 }, (_, i) => i);
    expect(chooseCohort(role, all, 30)).toEqual({ scope: "ROLE", values: role });
    expect(chooseCohort(role.slice(0, 29), all, 30)).toEqual({ scope: "ALL", values: all });
    expect(chooseCohort(role.slice(0, 29), all, 10).scope).toBe("ROLE"); // the threshold is a setting
  });
});
