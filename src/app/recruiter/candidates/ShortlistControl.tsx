"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OpeningOption = { id: string; label: string };

/** Shortlist a candidate for one of the open job openings. */
export default function ShortlistControl({ candidateId, openings, shortlistedIn = [] }: { candidateId: string; openings: OpeningOption[]; shortlistedIn?: string[] }) {
  const router = useRouter();
  const available = openings.filter((o) => !shortlistedIn.includes(o.id));
  const [openingId, setOpeningId] = useState(available[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (openings.length === 0) return <p className="text-xs text-zinc-500">Create a job opening to shortlist.</p>;
  if (available.length === 0) return <p className="text-xs text-green-700" data-testid="already-shortlisted">Shortlisted</p>;

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/recruiter/shortlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateProfileId: candidateId, jobOpeningId: openingId }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setDone(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`sl-${candidateId}`}>Job opening to shortlist for</label>
        <select id={`sl-${candidateId}`} className="input mt-0 min-h-9 max-w-52 py-1 text-sm" value={openingId} onChange={(e) => setOpeningId(e.target.value)} disabled={busy}>
          {available.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy || done} onClick={add}>{busy ? "Adding..." : done ? "Added" : "Shortlist"}</button>
      </div>
      {error && <p role="alert" className="max-w-64 text-xs text-red-600">{error}</p>}
    </div>
  );
}
