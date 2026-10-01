import { shuffle } from "./rng";

export type FormItem = { id: string; topic: string | null };

/**
 * Picks the questions for a fixed-length test (Personality, EQ). Items are taken round-robin across
 * topics (traits or dimensions), so the form stays balanced, then shuffled so neighbouring questions
 * are from different topics. `random` is seeded per session, so a resumed test keeps its order.
 */
export function buildFixedForm(items: FormItem[], count: number, random: () => number): string[] {
  const byTopic = new Map<string, string[]>();
  for (const item of items) {
    const key = item.topic ?? "";
    byTopic.set(key, [...(byTopic.get(key) ?? []), item.id]);
  }
  const queues = [...byTopic.values()].map((ids) => shuffle(ids, random));

  const picked: string[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const q of shuffle(queues, random)) {
      const next = q.shift();
      if (next !== undefined && picked.length < count) picked.push(next);
    }
  }
  return shuffle(picked, random);
}
