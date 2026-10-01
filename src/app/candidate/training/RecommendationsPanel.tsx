"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type RecommendedCourse = { id: string; title: string; reason: string; priceLabel: string; helpsWith: string | null };

/**
 * Courses suggested from the candidate's weak areas. When the saved list is out of date (new results, or none
 * yet) it is refreshed automatically once, then the page reloads with the new list.
 */
export default function RecommendationsPanel({ courses, stale, hasResults }: { courses: RecommendedCourse[]; stale: boolean; hasResults: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(stale);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/training/recommendations/refresh", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) setError(data?.error ?? "Recommendations could not be updated right now.");
      else router.refresh();
    } catch {
      setError("Recommendations could not be updated right now.");
    }
    setBusy(false);
  }, [router]);

  useEffect(() => {
    if (stale && !asked.current) {
      asked.current = true;
      void refresh();
    }
  }, [stale, refresh]);

  return (
    <section className="card" aria-labelledby="rec-h" data-testid="recommendations">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rec-h" className="text-lg font-semibold text-zinc-900">Recommended for you</h2>
        {hasResults && <button type="button" className="btn-secondary" disabled={busy} onClick={refresh}>{busy ? "Updating..." : "Refresh"}</button>}
      </div>
      {!hasResults && <p className="mt-2 text-sm text-zinc-700">Take a test and we will suggest courses for the areas where you can improve most.</p>}
      {hasResults && busy && courses.length === 0 && <p role="status" className="mt-2 text-sm text-zinc-600">Finding the best courses for you...</p>}
      {hasResults && !busy && courses.length === 0 && <p className="mt-2 text-sm text-zinc-700">No recommendations right now. Either your results are strong across the board, or there is no course for your weaker areas yet.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>}
      {courses.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {courses.map((c) => (
            <li key={c.id} className="rounded-lg border border-zinc-200 p-3" data-testid="recommended-course">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/candidate/training/${c.id}`} className="font-medium text-brand-700 underline">{c.title}</Link>
                <span className="text-sm text-zinc-600">{c.priceLabel}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-700">{c.reason}</p>
              {c.helpsWith && <p className="mt-1 text-xs text-zinc-500">Helps with: {c.helpsWith}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
