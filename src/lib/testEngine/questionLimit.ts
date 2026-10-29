import type { TestType } from "@prisma/client";
import { QUESTION_SECONDS_FIELD, type SettingValue } from "@/lib/settings/definitions";
import { TEST_TITLES } from "./labels";

type Testing = SettingValue<"testing">;
type Timing = { timeLimitMinutes: number; maxItems: number; pretestItemCount: number; isAdaptive: boolean };

/** Seconds allowed for one question of this test (Settings > Tests > Integrity); 0 means no limit. */
export const questionSecondsFor = (testing: Testing, testType: TestType): number => testing[QUESTION_SECONDS_FIELD[testType]];

/** How many questions a candidate can see in the test (adaptive tests may add pretest items). */
const questionsShown = (t: Timing) => t.maxItems + (t.isAdaptive ? t.pretestItemCount : 0);

/** The hint under a per-question limit, for example "IQ: 15 min overall, up to 22 questions, about 41 s per question". */
export function timingHint(testType: TestType, t: Timing): string {
  const n = questionsShown(t);
  const each = Math.floor((t.timeLimitMinutes * 60) / Math.max(1, n));
  return `${TEST_TITLES[testType]}: ${t.timeLimitMinutes} min overall, up to ${n} question${n === 1 ? "" : "s"}, about ${each} s per question`;
}

/** A per-question limit may not be longer than the whole test's time limit. Returns a message, or null when fine. */
export function limitTooLong(testType: TestType, seconds: number, timeLimitMinutes: number): string | null {
  if (seconds > timeLimitMinutes * 60) {
    return `${TEST_TITLES[testType]}: the time per question (${seconds} s) is longer than the whole test (${timeLimitMinutes} min, ${timeLimitMinutes * 60} s).`;
  }
  return null;
}
