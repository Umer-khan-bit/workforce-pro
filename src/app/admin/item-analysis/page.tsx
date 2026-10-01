import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { TEST_TYPE_LABELS } from "@/lib/questionBank/schema";
import ItemActions from "./ItemActions";

const PAGE_SIZE = 25;
const VIEWS = [
  { value: "flagged", label: "Needs review" },
  { value: "pretest", label: "Pretest ready" },
  { value: "all", label: "All with answers" },
] as const;
type View = (typeof VIEWS)[number]["value"];
const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);
const num = (n: number | null, d = 2) => (n === null ? "-" : n.toFixed(d));

/** Item analysis: how each question performs, which ones need a decision, and which pretest questions are ready to count. */
export default async function ItemAnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const view: View = VIEWS.find((v) => v.value === one("view"))?.value ?? "flagged";
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);
  const rules = await getSetting("selfLearning");

  const where: Prisma.ItemStatisticWhereInput =
    view === "flagged"
      ? { flagged: true }
      : view === "pretest"
        ? { lastCalibratedAt: { not: null }, question: { isPretest: true, status: "APPROVED" } }
        : { responseCount: { gt: 0 } };
  const [counts, total, rows] = await Promise.all([
    Promise.all([
      prisma.itemStatistic.count({ where: { flagged: true } }),
      prisma.itemStatistic.count({ where: { lastCalibratedAt: { not: null }, question: { isPretest: true, status: "APPROVED" } } }),
      prisma.itemStatistic.count({ where: { responseCount: { gt: 0 } } }),
    ]),
    prisma.itemStatistic.count({ where }),
    prisma.itemStatistic.findMany({
      where,
      orderBy: [{ flagged: "desc" }, { responseCount: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { question: { select: { id: true, content: true, testType: true, isPretest: true, status: true, aParam: true, bParam: true, language: { select: { name: true } }, jobRole: { select: { name: true } } } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tab = (v: View, label: string, n: number) => (
    <Link key={v} href={`/admin/item-analysis?view=${v}`} aria-current={view === v ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-medium ${view === v ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{label} ({n})</Link>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Item analysis</h1>
      <p className="mt-1 text-zinc-600">How each question performs once candidates have answered it. Questions are flagged for your review when they are too easy, too hard, do not separate strong from weak candidates, or may favour one group; nothing is ever removed without you. The limits are in <Link href="/admin/settings?group=selfLearning" className="text-brand-700 underline">Settings &gt; Self-learning</Link>; refresh the numbers under <Link href="/admin/recalibration" className="text-brand-700 underline">Recalibration</Link>.</p>
      <nav aria-label="View" className="mt-4 flex flex-wrap gap-2">{tab("flagged", VIEWS[0].label, counts[0])}{tab("pretest", VIEWS[1].label, counts[1])}{tab("all", VIEWS[2].label, counts[2])}</nav>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[60rem] text-left text-sm" data-testid="items-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-3">Question</th><th className="px-3 py-3">Answers</th><th className="px-3 py-3">Correct</th><th className="px-3 py-3">Discrimination</th><th className="px-3 py-3">Difficulty (b)</th><th className="px-3 py-3">Bias gap (gender / region / language)</th><th className="px-3 py-3">Why</th><th className="px-3 py-3">Decide</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-zinc-600">{view === "flagged" ? "Nothing needs your review. Questions are checked once they have enough answers." : view === "pretest" ? "No pretest question is ready yet." : "No question has been answered yet."}</td></tr>}
            {rows.map((s) => {
              const rate = s.responseCount ? s.correctCount / s.responseCount : null;
              const canPromote = s.question.isPretest && s.question.status === "APPROVED" && s.lastCalibratedAt !== null;
              return (
                <tr key={s.id} data-testid="item-row">
                  <td className="max-w-72 px-3 py-3">
                    <Link href={`/admin/question-bank/${s.question.id}/edit`} className="text-brand-700 underline">{s.question.content.slice(0, 110)}{s.question.content.length > 110 ? "..." : ""}</Link>
                    <p className="mt-1 text-xs text-zinc-500">{TEST_TYPE_LABELS[s.question.testType]}{s.question.jobRole ? ` · ${s.question.jobRole.name}` : ""}{s.question.language ? ` · ${s.question.language.name}` : ""}{s.question.isPretest ? " · pretest" : ""}{s.question.status !== "APPROVED" ? ` · ${s.question.status.toLowerCase()}` : ""}</p>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{s.responseCount}</td>
                  <td className="px-3 py-3 tabular-nums">{pct(rate)}</td>
                  <td className={`px-3 py-3 tabular-nums ${s.discrimination !== null && s.discrimination < rules.minDiscrimination ? "text-red-700" : ""}`}>{num(s.discrimination)}</td>
                  <td className="px-3 py-3 tabular-nums">{num(s.difficulty)}</td>
                  <td className="px-3 py-3 tabular-nums">{[s.difByGender, s.difByRegion, s.difByLanguage].map((g) => (g === null ? "-" : `${g > 0 ? "+" : ""}${Math.round(g * 100)}%`)).join(" / ")}</td>
                  <td className="max-w-64 px-3 py-3 text-xs text-zinc-700">{s.flagged ? s.flagReason : canPromote ? "Calibrated: ready to count towards scores." : s.reviewedAt ? "Reviewed and kept." : ""}</td>
                  <td className="px-3 py-3"><ItemActions id={s.question.id} flagged={s.flagged} canPromote={canPromote} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/admin/item-analysis?view=${view}&page=${page - 1}`} className="btn-secondary">Previous</Link> : <span />}
          <span className="text-zinc-600">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/admin/item-analysis?view=${view}&page=${page + 1}`} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
