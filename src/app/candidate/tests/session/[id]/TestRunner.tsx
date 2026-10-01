"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionView } from "@/lib/testEngine/session";
import { LIKERT_LABELS, TEST_TITLES } from "@/lib/testEngine/labels";

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The test screen: one question at a time, a countdown, progress, and automatic submission when the
 * time ends. All state lives on the server, so closing the browser and coming back resumes exactly
 * where the candidate was. A full-screen layout keeps phones focused on the question.
 */
export default function TestRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [view, setView] = useState<SessionView | null>(null);
  const [offset, setOffset] = useState(0); // server time minus this device's time
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState<{ key?: string; value?: number } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timedOut = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef(text);
  // Kept in a ref so the automatic submit at zero sends whatever has been typed, not a stale copy.
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const goToResult = useCallback(() => router.replace(`/candidate/tests/result/${sessionId}`), [router, sessionId]);

  const apply = useCallback(
    (next: SessionView) => {
      setOffset(Date.parse(next.serverNow) - Date.now());
      setView(next);
      setChoice(null);
      if (next.status !== "IN_PROGRESS") goToResult();
    },
    [goToResult]
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/tests/sessions/${sessionId}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "We could not load your test. Please reload the page.");
      return;
    }
    apply(data);
  }, [sessionId, apply]);

  // First load of the session. (Written with a promise chain so state is only set after the response arrives.)
  useEffect(() => {
    let active = true;
    fetch(`/api/tests/sessions/${sessionId}`, { cache: "no-store" }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!active) return;
      if (!res.ok) setError(data?.error ?? "We could not load your test. Please reload the page.");
      else apply(data);
    });
    return () => {
      active = false;
    };
  }, [sessionId, apply]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Move focus to the new question so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view?.question?.id, view?.phase]);

  const remaining = view ? Date.parse(view.expiresAt) - (now + offset) : null;

  // Time is up: submit what is written, or let the server close the test.
  useEffect(() => {
    if (!view || view.status !== "IN_PROGRESS" || remaining === null || remaining > 0 || timedOut.current) return;
    timedOut.current = true;
    (async () => {
      if (view.phase === "WRITING") {
        const res = await fetch(`/api/tests/sessions/${sessionId}/writing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textRef.current, timedOut: true }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) return apply(data);
      }
      await load();
    })();
  }, [remaining, view, sessionId, apply, load]);

  async function submitAnswer() {
    if (!view?.question || !choice || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tests/sessions/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: view.question.id, answer: choice }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      if (data?.code === "WRONG_QUESTION") await load();
      return;
    }
    apply(data);
  }

  async function submitWriting() {
    if (!view?.writing || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tests/sessions/${sessionId}/writing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    apply(data);
  }

  const title = view ? `${TEST_TITLES[view.testType]} test` : "Test";
  const low = remaining !== null && remaining <= 60_000;
  const words = wordCount(text);
  const writingOk = view?.writing ? words >= view.writing.minWords && words <= view.writing.maxWords + 0 : false;
  const position = view ? Math.min(view.answered + 1, view.total) : 0;
  const progress = view && view.total > 0 ? Math.min(100, Math.round((view.answered / view.total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background" data-testid="test-runner">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">{title}</p>
            {view && view.phase === "QUESTIONS" && (
              <p className="text-xs text-zinc-500" data-testid="position">
                Question {position} {view.testType === "PERSONALITY" || view.testType === "EQ" ? `of ${view.total}` : `of up to ${view.total}`}
              </p>
            )}
            {view && view.phase === "WRITING" && <p className="text-xs text-zinc-500">Writing task</p>}
          </div>
          <div className="flex items-center gap-3">
            <span
              role="timer"
              aria-label="Time left"
              data-testid="timer"
              className={`rounded-lg px-3 py-1.5 text-lg font-semibold tabular-nums ${low ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-900"}`}
            >
              {remaining === null ? "--:--" : formatClock(remaining)}
            </span>
            <Link href="/candidate/tests" className="text-sm text-zinc-600 underline">Leave</Link>
          </div>
        </div>
        <div className="h-1.5 bg-zinc-100" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full bg-brand-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {!view && !error && <p className="text-zinc-600" role="status">Loading your test...</p>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <p className="sr-only" role="status" aria-live="polite">{remaining !== null && remaining > 0 && remaining <= 60_000 ? "One minute left." : ""}</p>

        {view?.question && (
          <section aria-labelledby="question-h" dir={view.rtl ? "rtl" : "ltr"}>
            <h1 id="question-h" ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-snug text-zinc-900 outline-none" data-testid="question">
              {view.question.content}
            </h1>

            {view.question.type === "LIKERT" ? (
              <div role="radiogroup" aria-labelledby="question-h" className="mt-6 grid gap-3 sm:grid-cols-5" dir="ltr">
                {LIKERT_LABELS.map((label, i) => {
                  const value = i + 1;
                  const selected = choice?.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChoice({ value })}
                      data-testid={`likert-${value}`}
                      className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left sm:min-h-24 sm:flex-col sm:justify-center sm:gap-1 sm:text-center ${
                        selected ? "border-brand-700 bg-brand-50 text-brand-900" : "border-zinc-200 bg-white text-zinc-800 hover:border-brand-300"
                      }`}
                    >
                      <span className="text-lg font-semibold">{value}</span>
                      <span className="text-sm">{label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div role="radiogroup" aria-labelledby="question-h" className="mt-6 flex flex-col gap-3">
                {view.question.options.map((o) => {
                  const selected = choice?.key === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChoice({ key: o.key })}
                      data-testid={`option-${o.key}`}
                      className={`flex min-h-14 items-start gap-3 rounded-xl border-2 px-4 py-3 text-start text-base ${
                        selected ? "border-brand-700 bg-brand-50 text-brand-900" : "border-zinc-200 bg-white text-zinc-800 hover:border-brand-300"
                      }`}
                    >
                      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selected ? "bg-brand-700 text-white" : "bg-zinc-100 text-zinc-700"}`} dir="ltr">
                        {o.key}
                      </span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view?.writing && (
          <section aria-labelledby="writing-h" dir={view.rtl ? "rtl" : "ltr"}>
            <h1 id="writing-h" ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-snug text-zinc-900 outline-none" data-testid="writing-prompt">
              {view.writing.prompt}
            </h1>
            <p className="mt-2 text-sm text-zinc-600" dir="ltr">{view.writing.notice}</p>
            <label htmlFor="essay" className="sr-only">Your written answer</label>
            <textarea
              id="essay"
              className="input mt-4 min-h-56 text-base"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              data-testid="essay"
            />
            <p className={`mt-1 text-sm ${writingOk ? "text-zinc-600" : "text-amber-800"}`} dir="ltr" data-testid="word-count">
              {words} words (write {view.writing.minWords} to {view.writing.maxWords})
            </p>
          </section>
        )}

        {busy && view?.writing && <p role="status" className="mt-4 text-sm text-zinc-600">Submitting and grading your answer. This can take up to half a minute. Please keep this page open.</p>}
      </main>

      {view && view.status === "IN_PROGRESS" && (view.question || view.writing) && (
        <footer className="sticky bottom-0 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-2xl items-center justify-end px-4 py-3">
            {view.question ? (
              <button type="button" onClick={submitAnswer} disabled={!choice || busy} className="btn-primary w-full sm:w-auto sm:min-w-40" data-testid="next">
                {busy ? "Saving..." : "Next"}
              </button>
            ) : (
              <button type="button" onClick={submitWriting} disabled={!writingOk || busy} className="btn-primary w-full sm:w-auto sm:min-w-40" data-testid="submit-writing">
                {busy ? "Grading..." : "Submit answer"}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
