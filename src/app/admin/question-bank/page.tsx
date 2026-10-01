import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCoverage, listQuestions } from "@/lib/questionBank/queries";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PAGE_SIZE,
  QUESTION_TYPE_LABELS,
  STATUS_FILTERS,
  STATUS_LABELS,
  TEST_TYPES,
  TEST_TYPE_LABELS,
  parseListFilters,
  type ListFilters,
} from "@/lib/questionBank/schema";
import { getSetting } from "@/lib/settings";
import CoverageTables from "./CoverageTables";
import ImportIpipButton from "./ImportIpipButton";
import RowActions from "./RowActions";

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-800",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800",
  RETIRED: "bg-zinc-100 text-zinc-600",
  DRAFT: "bg-zinc-100 text-zinc-600",
  REJECTED: "bg-red-50 text-red-700",
};

function pageHref(filters: ListFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page })) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `/admin/question-bank?${qs}` : "/admin/question-bank";
}

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListFilters(await searchParams);

  const [{ total, rows }, coverage, jobRoles, languages, targets, pending] = await Promise.all([
    listQuestions(prisma, filters),
    getCoverage(prisma),
    prisma.jobRole.findMany({ orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
    getSetting("poolTargets"),
    prisma.question.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    filters.q || filters.testType || filters.jobRoleId || filters.languageId || filters.difficulty || filters.status
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Question bank</h1>
          <p className="mt-1 text-zinc-600">
            Add, edit and retire test questions, and see where the bank has gaps.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <ImportIpipButton />
          <Link href="/admin/question-bank/generate" className="btn-secondary">Generate with AI</Link>
          <Link href="/admin/approvals" className="btn-secondary">Approvals{pending > 0 ? ` (${pending})` : ""}</Link>
          <Link href="/admin/question-bank/new" className="btn-primary">Add question</Link>
        </div>
      </div>

      <CoverageTables coverage={coverage} targets={targets} />

      <section aria-labelledby="questions-heading" className="mt-8">
        <h2 id="questions-heading" className="text-lg font-semibold text-zinc-900">All questions</h2>

        <form method="get" className="card mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="f-q" className="label">Search</label>
            <input id="f-q" name="q" defaultValue={filters.q ?? ""} placeholder="Question text or topic" className="input" />
          </div>
          <div>
            <label htmlFor="f-test" className="label">Test</label>
            <select id="f-test" name="testType" defaultValue={filters.testType ?? ""} className="input">
              <option value="">All tests</option>
              {TEST_TYPES.map((t) => <option key={t} value={t}>{TEST_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-role" className="label">Job role</label>
            <select id="f-role" name="jobRoleId" defaultValue={filters.jobRoleId ?? ""} className="input">
              <option value="">All roles</option>
              {jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-lang" className="label">Language</label>
            <select id="f-lang" name="languageId" defaultValue={filters.languageId ?? ""} className="input">
              <option value="">All languages</option>
              {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-diff" className="label">Difficulty</label>
            <select id="f-diff" name="difficulty" defaultValue={filters.difficulty ?? ""} className="input">
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-status" className="label">Status</label>
            <select id="f-status" name="status" defaultValue={filters.status ?? ""} className="input">
              <option value="">Any status</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s === "FLAGGED" ? "Flagged" : STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary">Apply filters</button>
            {hasFilters && <Link href="/admin/question-bank" className="btn-secondary">Clear</Link>}
          </div>
        </form>

        <p className="mt-4 text-sm text-zinc-600" aria-live="polite">
          {total} question{total === 1 ? "" : "s"}
          {hasFilters ? " match your filters" : ""}
        </p>

        <div className="card mt-2 overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-3 font-medium">Question</th>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Language</th>
                <th className="px-4 py-3 font-medium">Difficulty</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-b border-zinc-100 align-top">
                  <td className="max-w-md px-4 py-3">
                    <p dir={q.language?.isRtl ? "rtl" : "ltr"} className="text-zinc-900">{q.content}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {QUESTION_TYPE_LABELS[q.type]}
                      {q.topic ? ` · ${q.topic}` : ""}
                      {q.reverseKeyed ? " · reverse-keyed" : ""}
                      {q.previousVersionId ? " · new version of an earlier question" : ""}
                      {q._count.nextVersions > 0 ? " · replaced by a newer version" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">{TEST_TYPE_LABELS[q.testType]}</td>
                  <td className="px-4 py-3">{q.jobRole?.name ?? "-"}</td>
                  <td className="px-4 py-3">{q.language?.name ?? "-"}</td>
                  <td className="px-4 py-3">{q.type === "MCQ" ? DIFFICULTY_LABELS[q.difficulty] : "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_BADGE[q.status] ?? ""}`}>{STATUS_LABELS[q.status]}</span>
                    {q.isPretest && <span className="badge ml-1.5 bg-brand-50 text-brand-800" title="Shown to candidates but not scored, until it is calibrated">Pretest</span>}
                    {q.itemStatistic?.flagged && (
                      <span className="badge ml-1.5 bg-red-50 text-red-700">Flagged</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <RowActions id={q.id} retired={q.status === "RETIRED"} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    {hasFilters ? "No questions match these filters." : "No questions yet. Import the IPIP items or add one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)} className="btn-secondary">Previous</Link>
            ) : <span />}
            <span className="text-zinc-600">Page {filters.page} of {pages}</span>
            {filters.page < pages ? (
              <Link href={pageHref(filters, filters.page + 1)} className="btn-secondary">Next</Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
