"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ShortlistItem = {
  id: string;
  name: string;
  detailHref: string;
  roleCity: string;
  status: string;
  note: string;
  addedOn: string;
  changedOn: string;
  history: { status: string; on: string }[];
};

const STATUSES: { value: string; label: string }[] = [
  { value: "SHORTLISTED", label: "Shortlisted" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "OFFERED", label: "Offered" },
  { value: "HIRED", label: "Hired" },
  { value: "REJECTED", label: "Rejected" },
];

/** One shortlisted candidate: move along the pipeline, edit the note, see the dates, or remove. */
export default function ShortlistRow({ item }: { item: ShortlistItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(item.note);
  const [showHistory, setShowHistory] = useState(false);

  async function call(method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/recruiter/shortlists/${item.id}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4" data-testid="shortlist-entry">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={item.detailHref} className="font-medium text-brand-700 underline">{item.name}</a>
          <p className="text-xs text-zinc-500">{item.roleCity}</p>
          <p className="mt-1 text-xs text-zinc-600">Shortlisted {item.addedOn} · last change {item.changedOn}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`st-${item.id}`} className="sr-only">Stage for {item.name}</label>
          <select id={`st-${item.id}`} className="input mt-0 min-h-9 py-1 text-sm" value={item.status} disabled={busy} onChange={(e) => call("PATCH", { status: e.target.value })} data-testid="stage-select">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => call("DELETE")}>Remove</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor={`nt-${item.id}`} className="sr-only">Note for {item.name}</label>
          <input id={`nt-${item.id}`} className="input mt-0 min-h-9 py-1 text-sm" value={note} maxLength={1000} placeholder="Add a note" onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy || note === item.note} onClick={() => call("PATCH", { note })}>Save note</button>
        <button type="button" className="text-sm text-brand-700 underline" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>{showHistory ? "Hide dates" : "Dates"}</button>
      </div>
      {showHistory && (
        <ol className="mt-2 list-decimal pl-5 text-xs text-zinc-600" data-testid="history">
          {item.history.map((h, i) => <li key={i}>{h.status} on {h.on}</li>)}
        </ol>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
