import {
  NO_LANGUAGE,
  coverageLevel,
  type Coverage,
  type CoverageLevel,
} from "@/lib/questionBank/queries";
import { TEST_TYPES, TEST_TYPE_LABELS, type TestTypeValue } from "@/lib/questionBank/schema";

const LEVEL_STYLES: Record<CoverageLevel, string> = {
  gap: "bg-red-50 font-semibold text-red-700",
  low: "bg-amber-50 font-medium text-amber-800",
  ok: "text-zinc-900",
};

function Cell({ approved, target }: { approved: number; target: number }) {
  const level = coverageLevel(approved, target);
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums ${LEVEL_STYLES[level]}`}>
      {approved}
      <span className="sr-only">
        {level === "gap" ? " (gap: none approved)" : level === "low" ? " (below target)" : ""}
      </span>
    </td>
  );
}

export default function CoverageTables({
  coverage,
  targets,
}: {
  coverage: Coverage;
  targets: Record<TestTypeValue, number>;
}) {
  const languageColumns = [...coverage.languages.map((l) => ({ id: l.id ?? NO_LANGUAGE, name: l.name }))];
  const unsetHasAny = TEST_TYPES.some((t) => (coverage.approvedByLanguage[t][NO_LANGUAGE] ?? 0) > 0);
  if (unsetHasAny) languageColumns.push({ id: NO_LANGUAGE, name: "No language set" });

  return (
    <section aria-labelledby="coverage-heading" className="mt-8">
      <h2 id="coverage-heading" className="text-lg font-semibold text-zinc-900">Coverage and gaps</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Only approved questions can be served in a test.{" "}
        <span className="rounded bg-red-50 px-1.5 text-red-700">Red</span> = none approved,{" "}
        <span className="rounded bg-amber-50 px-1.5 text-amber-800">amber</span> = below the target
        pool size shown in brackets.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="px-4 pt-4 text-left text-sm font-medium text-zinc-700">
              Questions by test and status
            </caption>
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 text-right font-medium">Approved</th>
                <th className="px-4 py-3 text-right font-medium">Pending</th>
                <th className="px-4 py-3 text-right font-medium">Retired</th>
                <th className="px-4 py-3 text-right font-medium">Flagged</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {coverage.byStatus.map((r) => (
                <tr key={r.testType} className="border-b border-zinc-100">
                  <th scope="row" className="px-4 py-2.5 font-medium text-zinc-900">
                    {TEST_TYPE_LABELS[r.testType]}
                  </th>
                  <Cell approved={r.approved} target={targets[r.testType]} />
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.pending}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.retired}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.flagged}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <caption className="px-4 pt-4 text-left text-sm font-medium text-zinc-700">
              Approved questions by test and language
            </caption>
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-3 font-medium">Test (target)</th>
                {languageColumns.map((l) => (
                  <th key={l.id} className="px-4 py-3 text-right font-medium">{l.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEST_TYPES.map((t) => (
                <tr key={t} className="border-b border-zinc-100">
                  <th scope="row" className="px-4 py-2.5 font-medium text-zinc-900">
                    {TEST_TYPE_LABELS[t]} <span className="font-normal text-zinc-500">({targets[t]})</span>
                  </th>
                  {languageColumns.map((l) => (
                    <Cell key={l.id} approved={coverage.approvedByLanguage[t][l.id] ?? 0} target={targets[t]} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-0 xl:col-span-2">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <caption className="px-4 pt-4 text-left text-sm font-medium text-zinc-700">
              Approved job skill questions by job role (target {targets.SKILL} each)
            </caption>
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-3 font-medium">Job role</th>
                <th className="px-4 py-3 text-right font-medium">Approved</th>
              </tr>
            </thead>
            <tbody>
              {coverage.roles.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <th scope="row" className="px-4 py-2.5 font-medium text-zinc-900">{r.name}</th>
                  <Cell approved={r.approved} target={targets.SKILL} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
