import type { DifficultyValue } from "./schema";

/**
 * Once candidates have answered a question, what it says and how it is scored are frozen: past answers
 * were given to that exact wording. A change is made by retiring the question and adding a new version
 * that points back to it. Only the explanation (display text) may still be edited.
 */
export const LOCKED_MESSAGE =
  "Candidates have already answered this question, so its wording, answers and settings can no longer be changed. Retire it and add a new version instead.";

type Option = { key: string; text: string };

export type QuestionFields = {
  content: string;
  options: unknown;
  correctAnswer: string | null;
  type: string;
  testType: string;
  reverseKeyed: boolean;
  topic: string | null;
  languageId: string | null;
  jobRoleId: string | null;
  difficulty: DifficultyValue | string;
};

/** Options as a comparable string: sorted by key, only key and text, so key order never counts as a change. */
function optionsKey(options: unknown): string {
  if (!Array.isArray(options)) return "[]";
  const list = (options as Option[]).map((o) => ({ key: o.key, text: o.text })).sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify(list);
}

/**
 * Names of the frozen fields that differ between a question and its proposed new values. Difficulty is
 * included because changing the label resets the question's calibrated difficulty number.
 */
export function protectedChanges(existing: QuestionFields, next: QuestionFields): string[] {
  const changes: string[] = [];
  if (existing.content !== next.content) changes.push("question text");
  if (optionsKey(existing.options) !== optionsKey(next.options)) changes.push("answer options");
  if ((existing.correctAnswer ?? null) !== (next.correctAnswer ?? null)) changes.push("correct answer");
  if (existing.type !== next.type) changes.push("question format");
  if (existing.testType !== next.testType) changes.push("test");
  if (existing.reverseKeyed !== next.reverseKeyed) changes.push("reverse-keying");
  if ((existing.topic ?? null) !== (next.topic ?? null)) changes.push("topic");
  if ((existing.languageId ?? null) !== (next.languageId ?? null)) changes.push("language");
  if ((existing.jobRoleId ?? null) !== (next.jobRoleId ?? null)) changes.push("job role");
  if (existing.difficulty !== next.difficulty) changes.push("difficulty");
  return changes;
}

/** True when the database refused an edit through the safety trigger (a response arrived at the last moment). */
export function isFrozenQuestionError(err: unknown): boolean {
  return err instanceof Error && /retire it and add a new version/i.test(err.message);
}
