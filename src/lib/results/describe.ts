import type { LatestResult } from "./latest";
import { topShare } from "./latest";

/**
 * Plain-language lines describing one result, shared by the results page and the PDF report so both
 * always say the same thing. Rankings are always labelled with the number of candidates they are based on.
 */
export function resultLines(r: LatestResult, minCohortSize: number): string[] {
  if (r.testType === "PERSONALITY") return ["Five personality traits, scored 1 to 5. These describe your style; they are not ranked and not a pass or fail."];

  const lines: string[] = [];
  if (r.provisional) {
    lines.push("Your written answer is still being graded, so this result is not final yet.");
    return lines;
  }
  if (r.quartile !== null && r.percentile !== null) {
    lines.push(`Quartile Q${r.quartile} (Q1 is the highest group, Q4 the lowest).`);
    if (r.cohort) {
      const group = r.cohort.scope === "ROLE" ? "candidates in your job role" : "candidates overall";
      lines.push(`Better than ${Math.round(r.percentile)}% of ${r.cohort.size} ${group} (top ${topShare(r.percentile)}%).`);
      if (r.cohort.size < minCohortSize) lines.push(`This is based on a small group (fewer than ${minCohortSize} candidates), so treat it as a rough guide.`);
    }
  }
  if (r.testType === "EQ") lines.push(`EQ score: ${Math.round(r.rawScore)} out of 100.`);
  else if (r.testType === "LANGUAGE") {
    if (r.cefrLevel) lines.push(`Written language level (CEFR): ${r.cefrLevel}.`);
    lines.push(`Multiple-choice answers correct: ${Math.round(r.rawScore)}%.`);
  } else lines.push(`Questions answered correctly: ${Math.round(r.rawScore)}%.`);
  return lines;
}
