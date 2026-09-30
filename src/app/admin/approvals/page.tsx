import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { countUntranslated } from "@/lib/ai/translate";
import {
  DIFFICULTY_LABELS,
  PAGE_SIZE,
  QUESTION_TYPE_LABELS,
  TEST_TYPES,
  TEST_TYPE_LABELS,
} from "@/lib/questionBank/schema";
import ApprovalsTable, { type PendingRow } from "./ApprovalsTable";
import TranslatePanel from "./TranslatePanel";

const SOURCES = ["AI_GENERATED", "AI_TRANSLATED", "MANUAL", "IMPORTED"] as const;
const SOURCE_LABEL = { AI_GENERATED: "AI-generated", AI_TRANSLATED: "AI-translated", MANUAL: "Manual", IMPORTED: "Imported" } as const;

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const testType = TEST_TYPES.find((t) => t === one("testType"));
  const source = SOURCES.find((s) => s === one("source"));
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);

  const where = { status: "PENDING_APPROVAL" as const, ...(testType ? { testType } : {}), ...(source ? { source } : {}) };

  const [total, flagged, questions, languages] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.count({ where: { status: "PENDING_APPROVAL", reviewVerdict: { in: ["NEEDS_FIX", "REJECT"] } } }),
    prisma.question.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { jobRole: true, language: true, translationOf: { select: { content: true } } },
    }),
    prisma.language.findMany({ where: { isActive: true, isDefault: false }, orderBy: { name: "asc" } }),
  ]);

  const translateOptions = await Promise.all(
    languages.map(async (l) => ({ id: l.id, name: l.name, untranslated: await countUntranslated(prisma, l.id) }))
  );

  const rows: PendingRow[] = questions.map((q) => ({
    id: q.id,
    testLabel: TEST_TYPE_LABELS[q.testType],
    typeLabel: QUESTION_TYPE_LABELS[q.type],
    content: q.content,
    options: Array.isArray(q.options) ? (q.options as { key: string; text: string }[]) : [],
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    topic: q.topic,
    reverseKeyed: q.reverseKeyed,
    difficultyLabel: q.type === "MCQ" ? DIFFICULTY_LABELS[q.difficulty] : null,
    roleName: q.jobRole?.name ?? null,
    languageName: q.language?.name ?? null,
    rtl: q.language?.isRtl ?? false,
    source: q.source,
    verdict: q.reviewVerdict,
    reviewNotes: q.reviewNotes,
    originalText: q.translationOf?.content ?? null,
  }));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (testType) params.set("testType", testType);
    if (source) params.set("source", source);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/approvals?${qs}` : "/admin/approvals";
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Approvals</h1>
      <p className="mt-1 text-zinc-600">
        Questions wait here until you approve them. {flagged > 0 && <span className="text-amber-800">{flagged} flagged by the AI review.</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/admin/question-bank/generate" className="btn-primary">Generate with AI</Link>
        <Link href="/admin/question-bank" className="btn-secondary">Question bank</Link>
      </div>

      <TranslatePanel languages={translateOptions} keyMissing={!process.env.ANTHROPIC_API_KEY?.trim()} />

      <form method="get" className="card mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="a-test" className="label">Test</label>
          <select id="a-test" name="testType" defaultValue={testType ?? ""} className="input">
            <option value="">All tests</option>
            {TEST_TYPES.map((t) => <option key={t} value={t}>{TEST_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="a-source" className="label">Source</label>
          <select id="a-source" name="source" defaultValue={source ?? ""} className="input">
            <option value="">Any source</option>
            {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(testType || source) && <Link href="/admin/approvals" className="btn-secondary">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-zinc-600" aria-live="polite">{total} pending</p>

      <ApprovalsTable key={`${testType}-${source}-${page}`} rows={rows} />

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="btn-secondary">Previous</Link> : <span />}
          <span className="text-zinc-600">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
