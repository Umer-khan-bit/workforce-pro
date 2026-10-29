"use client";

import { useState } from "react";

const MAX = 500;

/** "Report a concern" for one test result: a short required reason that goes to the platform admins. A company can report a result once. */
export default function ReportConcern({ candidateId, testType, offer, opening, reportedOn }: { candidateId: string; testType: string; offer: number | null; opening: string | null; reportedOn: string | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(reportedOn);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/recruiter/candidates/${candidateId}/concern`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testType, reason, opening, offer }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setDone(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
    setOpen(false);
  }

  if (done) return <p className="mt-2 text-xs text-zinc-600" data-testid={`reported-${testType}`}>Your company reported a concern about this result on {done}. The platform team will look at it.</p>;

  return (
    <div className="mt-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm text-zinc-700 underline" data-testid={`report-concern-${testType}`}>Report a concern</button>
      ) : (
        <form onSubmit={send} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3" aria-label="Report a concern">
          <label htmlFor={`concern-${testType}`} className="label">Why are you concerned about this result?</label>
          <textarea
            id={`concern-${testType}`}
            className="input min-h-20"
            value={reason}
            maxLength={MAX}
            required
            onChange={(e) => setReason(e.target.value)}
            data-testid={`concern-reason-${testType}`}
          />
          <p className="mt-1 text-xs text-zinc-500">{reason.length} / {MAX}. The platform team reviews it; only they can change a result. Other companies do not see your report.</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy || reason.trim().length === 0} className="btn-primary" data-testid={`concern-send-${testType}`}>{busy ? "Sending..." : "Send report"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
