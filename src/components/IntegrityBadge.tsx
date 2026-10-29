import type { TestType } from "@prisma/client";
import type { IntegrityLevel } from "@/lib/integrity/summary";
import { TEST_TITLES } from "@/lib/testEngine/labels";

const exitsText = (n: number) => `${n} exit${n === 1 ? "" : "s"}`;

/**
 * The Integrity column in candidate search: counts only, in three states.
 * none: green check. info: a few exits below the threshold, neutral grey (information only). concern: at or above the threshold, red.
 */
export function IntegrityBadge({ exits, level, perTest }: { exits: number; level: IntegrityLevel; perTest: { testType: TestType; exits: number }[] }) {
  const title = perTest.filter((t) => t.exits > 0).map((t) => `${TEST_TITLES[t.testType]}: ${exitsText(t.exits)}`).join(", ") || undefined;
  if (level === "none") return <span className="whitespace-nowrap text-green-700" data-testid="integrity" data-level="none">✓ No concerns</span>;
  if (level === "info") return <span className="whitespace-nowrap text-zinc-600" title={title} data-testid="integrity" data-level="info">{exitsText(exits)}</span>;
  return <span className="whitespace-nowrap font-semibold text-red-700" title={title} data-testid="integrity" data-level="concern">⚠ {exitsText(exits)}</span>;
}

/** The same rule on the candidate report: one line per test, with the wording that is also printed on the PDF. */
export function IntegrityNote({ info, testType }: { info: { line: string; level: IntegrityLevel }; testType: TestType }) {
  const style = info.level === "concern" ? "font-semibold text-red-700" : info.level === "info" ? "text-zinc-600" : "text-green-700";
  return (
    <p className={style} data-testid={`integrity-${testType}`} data-level={info.level}>
      {info.level === "concern" ? "⚠ " : info.level === "none" ? "✓ " : ""}
      {info.line}
    </p>
  );
}
