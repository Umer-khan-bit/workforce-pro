import { itemInformation } from "./irt";

/** A question the engine may serve. `exposure` is the share of recent tests that already used it (0 to 1). */
export type CatItem = { id: string; a: number; b: number; topic: string | null; exposure: number };

export type SelectionSettings = {
  /** Pick at random among this many of the most informative items. */
  topK: number;
  /** Items used more often than this are skipped while enough alternatives remain. */
  maxExposureRate: number;
  /** Information is divided by (1 + penalty * how many items of the same topic were already served). */
  topicBalancePenalty: number;
};

/**
 * Chooses the next question: the item with maximum information at the current ability, among items
 * not yet seen, with topic balance and exposure control.
 *  1. Drop items already served (never repeat a question).
 *  2. Drop over-exposed items, but only if at least `topK` items remain without them.
 *  3. Score each item: information at theta, reduced for topics already used a lot.
 *  4. Pick randomly among the best `topK` (randomesque exposure control).
 * Returns null when no item is left.
 */
export function selectNextItem(args: {
  theta: number;
  pool: CatItem[];
  seenIds: Set<string>;
  servedTopics: Map<string, number>;
  settings: SelectionSettings;
  random: () => number;
}): CatItem | null {
  const { theta, pool, seenIds, servedTopics, settings, random } = args;
  const unseen = pool.filter((item) => !seenIds.has(item.id));
  if (unseen.length === 0) return null;

  const underCap = unseen.filter((item) => item.exposure <= settings.maxExposureRate);
  const eligible = underCap.length >= settings.topK ? underCap : unseen;

  const scored = eligible
    .map((item) => {
      const used = item.topic ? (servedTopics.get(item.topic) ?? 0) : 0;
      return { item, value: itemInformation(theta, item) / (1 + settings.topicBalancePenalty * used) };
    })
    // Ties broken by id so the order is stable whatever order the database returned.
    .sort((x, y) => y.value - x.value || x.item.id.localeCompare(y.item.id));

  const top = scored.slice(0, Math.max(1, settings.topK));
  return top[Math.floor(random() * top.length)].item;
}

/**
 * Stopping rule for adaptive tests: stop once the standard error is below the threshold (after at
 * least `minItems` scored items), or when `maxItems` scored items have been answered.
 * Unscored pretest items are not counted.
 */
export function shouldStop(args: {
  scoredCount: number;
  standardError: number;
  minItems: number;
  maxItems: number;
  seThreshold: number;
}): boolean {
  const { scoredCount, standardError, minItems, maxItems, seThreshold } = args;
  if (scoredCount >= maxItems) return true;
  return scoredCount >= minItems && standardError < seThreshold;
}

/**
 * Which positions (0-based, among all questions shown) hold the unscored pretest items. They are
 * placed inside the first `minItems` positions, so every test reaches them, and never first.
 */
export function pretestPositions(count: number, minItems: number, random: () => number): number[] {
  const slots: number[] = [];
  const lastSlot = Math.max(1, minItems + count - 1);
  const candidates = Array.from({ length: lastSlot }, (_, i) => i + 1); // 1..lastSlot, never position 0
  while (slots.length < count && candidates.length > 0) {
    slots.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]);
  }
  return slots.sort((x, y) => x - y);
}

/** Exposure of an item: how often it was used relative to the number of tests taken (with a warm-up floor). */
export function exposureRate(timesUsed: number, testsTaken: number, warmupTests: number): number {
  return timesUsed / Math.max(testsTaken, warmupTests, 1);
}
