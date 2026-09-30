"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  TEST_TYPE_LABELS,
  type DifficultyValue,
} from "@/lib/questionBank/schema";

type Option = { id: string; name: string };
type TestOption = "IQ" | "EQ" | "LANGUAGE" | "SKILL";

type BatchResponse = {
  created: number;
  dropped: number;
  droppedReasons: string[];
  reviewed: boolean;
  reviewWarning: string | null;
  verdicts: { OK: number; NEEDS_FIX: number; REJECT: number };
  costEstimate: number;
  inputTokens: number;
  outputTokens: number;
};

type Totals = { created: number; dropped: number; ok: number; needsFix: number; reject: number; cost: number; tokens: number; warnings: string[] };
const EMPTY_TOTALS: Totals = { created: 0, dropped: 0, ok: 0, needsFix: 0, reject: 0, cost: 0, tokens: 0, warnings: [] };

const money = (d: number) => (d < 0.01 ? `$${d.toFixed(4)}` : `$${d.toFixed(2)}`);

export default function GenerateForm({
  tests,
  jobRoles,
  languages,
  batchSize,
  maxPerRun,
  keyMissing,
}: {
  tests: TestOption[];
  jobRoles: Option[];
  languages: Option[];
  batchSize: number;
  maxPerRun: number;
  keyMissing: boolean;
}) {
  const [testType, setTestType] = useState<TestOption>("IQ");
  const [jobRoleId, setJobRoleId] = useState("");
  const [languageId, setLanguageId] = useState(languages[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<DifficultyValue>("MEDIUM");
  const [count, setCount] = useState("10");
  const [focus, setFocus] = useState("");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const total = Number(count);
  const valid = Number.isInteger(total) && total >= 1 && total <= maxPerRun && Boolean(languageId) && (testType !== "SKILL" || Boolean(jobRoleId));
  const batches = valid ? Math.ceil(total / batchSize) : 0;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || running) return;
    setRunning(true);
    setError(null);
    setFinished(false);
    setTotals(EMPTY_TOTALS);

    let remaining = total;
    let acc = EMPTY_TOTALS;
    setProgress({ done: 0, total });

    while (remaining > 0) {
      const thisBatch = Math.min(batchSize, remaining);
      const res = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testType, jobRoleId: testType === "SKILL" ? jobRoleId : undefined, languageId, difficulty, count: thisBatch, focus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Stop at the first problem. Batches already saved stay in the approval queue.
        setError(data?.error ?? "Something went wrong. Please try again.");
        break;
      }
      const batch = data as BatchResponse;
      acc = {
        created: acc.created + batch.created,
        dropped: acc.dropped + batch.dropped,
        ok: acc.ok + batch.verdicts.OK,
        needsFix: acc.needsFix + batch.verdicts.NEEDS_FIX,
        reject: acc.reject + batch.verdicts.REJECT,
        cost: acc.cost + batch.costEstimate,
        tokens: acc.tokens + batch.inputTokens + batch.outputTokens,
        warnings: batch.reviewWarning ? [...acc.warnings, batch.reviewWarning] : acc.warnings,
      };
      setTotals(acc);
      remaining -= thisBatch;
      setProgress({ done: total - remaining, total });
      if (batch.created === 0 && batch.dropped === 0) break;
    }
    setRunning(false);
    setFinished(true);
  }

  return (
    <div className="mt-6 max-w-3xl">
      {keyMissing && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The Anthropic API key is not set. Add ANTHROPIC_API_KEY to the .env file and restart the app before generating.
        </p>
      )}

      <form onSubmit={run} className="card flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="g-test" className="label">Test</label>
            <select id="g-test" className="input" value={testType} onChange={(e) => setTestType(e.target.value as TestOption)} disabled={running}>
              {tests.map((t) => <option key={t} value={t}>{TEST_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="g-lang" className="label">Language</label>
            <select id="g-lang" className="input" value={languageId} onChange={(e) => setLanguageId(e.target.value)} disabled={running}>
              {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {testType === "SKILL" && (
            <div>
              <label htmlFor="g-role" className="label">Job role</label>
              <select id="g-role" className="input" value={jobRoleId} onChange={(e) => setJobRoleId(e.target.value)} disabled={running}>
                <option value="">Choose a role...</option>
                {jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="g-diff" className="label">Difficulty</label>
            <select id="g-diff" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as DifficultyValue)} disabled={running}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
            </select>
            {testType === "EQ" && <p className="mt-1 text-xs text-zinc-500">EQ items do not use a difficulty level.</p>}
            {testType === "LANGUAGE" && <p className="mt-1 text-xs text-zinc-500">For Language this sets the CEFR level (see Settings &gt; AI prompts).</p>}
          </div>
          <div>
            <label htmlFor="g-count" className="label">How many questions</label>
            <input id="g-count" type="number" min={1} max={maxPerRun} className="input" value={count} onChange={(e) => setCount(e.target.value)} disabled={running} />
            <p className="mt-1 text-xs text-zinc-500">
              Up to {maxPerRun} per run, written in batches of {batchSize}
              {batches > 1 ? ` (${batches} batches)` : ""}.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="g-focus" className="label">Focus (optional)</label>
          <input id="g-focus" className="input" value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} disabled={running} placeholder="e.g. month-end closing, or customer complaints" />
        </div>

        <p className="text-sm text-zinc-600">
          Everything is saved as <strong>Pending</strong> with an AI review note. Nothing goes live until you approve it.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={!valid || running || keyMissing}>
            {running ? "Generating..." : "Generate and review"}
          </button>
          <Link href="/admin/approvals" className="btn-secondary">Open approvals</Link>
        </div>
      </form>

      {progress && (
        <section aria-live="polite" className="card mt-5">
          <h2 className="font-semibold text-zinc-900">{running ? "Working..." : finished ? "Finished" : ""}</h2>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-brand-700 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-zinc-600">{progress.done} of {progress.total} requested</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-zinc-500">Saved as pending</dt><dd className="text-lg font-semibold">{totals.created}</dd></div>
            <div><dt className="text-zinc-500">Left out</dt><dd className="text-lg font-semibold">{totals.dropped}</dd></div>
            <div><dt className="text-zinc-500">Estimated cost</dt><dd className="text-lg font-semibold">{money(totals.cost)}</dd></div>
            <div><dt className="text-zinc-500">Tokens used</dt><dd className="text-lg font-semibold">{totals.tokens.toLocaleString()}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-zinc-700">
            AI review: <span className="text-green-700">{totals.ok} OK</span>,{" "}
            <span className="text-amber-700">{totals.needsFix} need fixing</span>,{" "}
            <span className="text-red-700">{totals.reject} reject</span>
          </p>
          {totals.warnings.map((w, i) => <p key={i} className="mt-2 text-sm text-amber-800">{w}</p>)}
        </section>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    </div>
  );
}
