/**
 * The example sentence shown above the AI search box. It is built from a job role and a city that exist (and are active) in
 * the database, so it never names something an admin has removed; with none of them it falls back to a general sentence.
 */
export function aiSearchExample(jobRole: string | null | undefined, city: string | null | undefined): string {
  const role = jobRole?.trim();
  const place = city?.trim();
  if (!role && !place) return "candidates with at least 3 years of experience and strong IQ";
  return `${role ? `${role} candidates` : "candidates"}${place ? ` in ${place}` : ""} with at least 3 years of experience and strong IQ`;
}
