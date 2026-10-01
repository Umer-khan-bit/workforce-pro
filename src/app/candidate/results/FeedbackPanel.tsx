"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Feedback = { text: string; tips: string[] };

/**
 * AI feedback and improvement tips for one result. If it has not been written yet it is requested as soon
 * as the page opens (the server writes it once and saves it), with a button to try again if that fails.
 */
export default function FeedbackPanel({ scoreId, initial }: { scoreId: string; initial: Feedback | null }) {
  const [feedback, setFeedback] = useState<Feedback | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/results/${scoreId}/feedback`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) setError(data?.error ?? "Feedback could not be written right now.");
      else setFeedback(data.feedback);
    } catch {
      setError("Feedback could not be written right now. Check your connection and try again.");
    }
    setLoading(false);
  }, [scoreId]);

  useEffect(() => {
    if (initial === null && !asked.current) {
      asked.current = true;
      void load();
    }
  }, [initial, load]);

  return (
    <div className="mt-4 rounded-lg bg-brand-50 p-4" data-testid="feedback">
      <h3 className="text-sm font-semibold text-brand-900">Feedback and how to improve</h3>
      {loading && <p role="status" className="mt-2 text-sm text-zinc-600">Writing your feedback...</p>}
      {error && (
        <div className="mt-2">
          <p role="alert" className="text-sm text-amber-800">{error}</p>
          <button type="button" className="btn-secondary mt-2" onClick={load}>Try again</button>
        </div>
      )}
      {feedback && (
        <>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-800">{feedback.text}</p>
          {feedback.tips.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-800">
              {feedback.tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ol>
          )}
          <p className="mt-3 text-xs text-zinc-500">Written by AI from your result. It is advice, not a hiring decision.</p>
        </>
      )}
    </div>
  );
}
