"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PushRow = { reference: string; name: string; opening: string; stage: string; inAts: string | null };

/** Choose shortlisted candidates and push them to the ATS. */
export default function PushPanel({ rows, canPush }: { rows: PushRow[]; canPush: boolean }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const all = rows.length > 0 && chosen.length === rows.length;
  const toggle = (ref: string) => setChosen((c) => (c.includes(ref) ? c.filter((r) => r !== ref) : [...c, ref]));

  async function push() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/recruiter/ats/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shortlistIds: chosen }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMessage({ text: data?.error ?? "Something went wrong. Please try again.", ok: false });
    const failed = data.failed?.length ?? 0;
    const skipped = data.skipped ?? 0;
    setMessage({ text: `Pushed ${data.pushed.length} candidate${data.pushed.length === 1 ? "" : "s"} to the ATS${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped (no longer available)` : ""}.`, ok: failed === 0 });
    setChosen([]);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={!canPush || busy || chosen.length === 0} onClick={push} data-testid="push-button">{busy ? "Pushing..." : `Push to ATS${chosen.length ? ` (${chosen.length})` : ""}`}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`} data-testid="push-message">{message.text}</p>}
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[34rem] text-left text-sm" data-testid="push-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-3"><input type="checkbox" className="size-4" aria-label="Select all" checked={all} onChange={() => setChosen(all ? [] : rows.map((r) => r.reference))} disabled={!canPush} /></th>
              <th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Job opening</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">In the ATS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-zinc-600">No shortlisted candidates yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.reference} data-testid="push-row">
                <td className="px-3 py-3"><input type="checkbox" className="size-4" aria-label={`Select ${r.name}`} checked={chosen.includes(r.reference)} onChange={() => toggle(r.reference)} disabled={!canPush} /></td>
                <td className="px-3 py-3 font-medium text-zinc-900">{r.name}</td>
                <td className="px-3 py-3">{r.opening}</td>
                <td className="px-3 py-3">{r.stage}</td>
                <td className="px-3 py-3">{r.inAts ? <span className="badge bg-green-50 text-green-800">{r.inAts}</span> : <span className="text-zinc-400">Not pushed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
