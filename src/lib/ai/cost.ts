export type Usage = { inputTokens: number; outputTokens: number };

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/** Estimated cost in US dollars from token counts and prices per million tokens. */
export function estimateCost(usage: Usage, inputPricePerMTok: number, outputPricePerMTok: number): number {
  const dollars = (usage.inputTokens * inputPricePerMTok + usage.outputTokens * outputPricePerMTok) / 1_000_000;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

export function formatCost(dollars: number): string {
  return dollars < 0.01 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`;
}
