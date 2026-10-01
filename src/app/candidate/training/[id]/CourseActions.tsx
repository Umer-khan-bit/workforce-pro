"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Joins a free course with one click. */
export function EnrolButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enrol() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/training/courses/${courseId}/enrol`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn-primary" disabled={busy} onClick={enrol}>{busy ? "Joining..." : "Join this course"}</button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export type LessonRow = { id: string; title: string; content: string | null; durationMinutes: number | null; done: boolean };

/** The lessons of a course the candidate has joined: read each one and tick it off. */
export function LessonList({ lessons }: { lessons: LessonRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(lesson: LessonRow) {
    setBusy(lesson.id);
    setError(null);
    const res = await fetch(`/api/training/lessons/${lesson.id}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !lesson.done }) });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div>
      <ol className="flex flex-col gap-3" data-testid="lessons">
        {lessons.map((l, i) => (
          <li key={l.id} className="rounded-lg border border-zinc-200 bg-white" data-testid="lesson" data-done={l.done}>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2">
                <span className="font-medium text-zinc-900">{i + 1}. {l.title}</span>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {l.durationMinutes ? `${l.durationMinutes} min` : ""}
                  {l.done && <span className="badge bg-green-50 text-green-800">Done</span>}
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-4 py-3">
                <p className="whitespace-pre-line text-sm text-zinc-800">{l.content || "This lesson has no text yet."}</p>
                <button type="button" className={l.done ? "btn-secondary mt-3" : "btn-primary mt-3"} disabled={busy !== null} onClick={() => toggle(l)}>
                  {busy === l.id ? "Saving..." : l.done ? "Mark as not done" : "Mark as done"}
                </button>
              </div>
            </details>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** The demo checkout: pay, or simulate a failed payment. No real money moves in demo mode. */
export function CheckoutForm({ courseId, amountLabel, demo }: { courseId: string; amountLabel: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(simulate: "success" | "failure") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/training/courses/${courseId}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simulate }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.push(`/candidate/training/${courseId}`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => pay("success")} data-testid="pay">{busy ? "Processing..." : `Pay ${amountLabel}`}</button>
        {demo && <button type="button" className="btn-secondary" disabled={busy} onClick={() => pay("failure")} data-testid="pay-fail">Simulate a failed payment</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600" data-testid="pay-error">{error}</p>}
    </div>
  );
}
