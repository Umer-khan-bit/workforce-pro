/**
 * The report period choices (in days) as the admin writes them in Settings > Recruiter tools, for example "30, 90, 180, 365".
 * Returns the valid, distinct numbers in ascending order; anything that is not a whole number from 1 to 730 is left out.
 */
export function parsePeriodChoices(text: string): number[] {
  const numbers = text.split(/[\s,;]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  return [...new Set(numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 730))].sort((a, b) => a - b);
}

/** True when the text holds one to eight valid period choices and nothing else. */
export function validPeriodChoices(text: string): boolean {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const parsed = parsePeriodChoices(text);
  return parts.length >= 1 && parts.length <= 8 && parsed.length === new Set(parts.map(Number)).size;
}
