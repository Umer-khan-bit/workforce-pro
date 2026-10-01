"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type PendingRow = {
  id: string;
  testLabel: string;
  typeLabel: string;
  content: string;
  options: { key: string; text: string }[];
  correctAnswer: string | null;
  explanation: string | null;
  topic: string | null;
  reverseKeyed: boolean;
  difficultyLabel: string | null;
  roleName: string | null;
  languageName: string | null;
  rtl: boolean;
  source: "MANUAL" | "IMPORTED" | "AI_GENERATED" | "AI_TRANSLATED";
  verdict: "OK" | "NEEDS_FIX" | "REJECT" | null;
  reviewNotes: string | null;
  originalText: string | null;
};

const VERDICT_STYLE = {
  OK: "bg-green-50 text-green-800",
  NEEDS_FIX: "bg-amber-50 text-amber-800",
  REJECT: "bg-red-50 text-red-700",
} as const;
const VERDICT_LABEL = { OK: "AI review: OK", NEEDS_FIX: "AI review: needs fixing", REJECT: "AI review: reject" } as const;
const SOURCE_LABEL = { MANUAL: "Manual", IMPORTED: "Imported", AI_GENERATED: "AI-generated", AI_TRANSLATED: "AI-translated" } as const;

export default function ApprovalsTable({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeFlagged, setIncludeFlagged] = useState(false);
  const [asPretest, setAsPretest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Rows disappear after approve/reject, so only count what is still on the page.
  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  }

  async function approveOne(id: string) {
    setBusy(true);
    setMessage(null);
    const r = await post(`/api/admin/questions/${id}/approve`, { asPretest });
    setBusy(false);
    if (!r.ok) return setMessage({ text: r.data?.error ?? "Something went wrong", ok: false });
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    router.refresh();
  }

  async function rejectOne(id: string) {
    setBusy(true);
    setMessage(null);
    const r = await post(`/api/admin/questions/${id}/reject`, { reason });
    setBusy(false);
    if (!r.ok) return setMessage({ text: r.data?.error ?? "Something went wrong", ok: false });
    setRejecting(null);
    setReason("");
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    router.refresh();
  }

  async function approveSelected() {
    setBusy(true);
    setMessage(null);
    const r = await post("/api/admin/questions/bulk-approve", { ids: selectedIds, includeFlagged, asPretest });
    setBusy(false);
    if (!r.ok) return setMessage({ text: r.data?.error ?? "Something went wrong", ok: false });
    const d = r.data as { approved: number; skippedFlagged: number; skippedNotPending: number };
    const parts = [`Approved ${d.approved}.`];
    if (d.skippedFlagged) parts.push(`${d.skippedFlagged} flagged by the AI review were left pending (tick "include flagged" to approve those too).`);
    if (d.skippedNotPending) parts.push(`${d.skippedNotPending} were no longer pending.`);
    setMessage({ text: parts.join(" "), ok: true });
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="card sticky top-14 z-10 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 py-3 lg:top-0">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            className="size-5 accent-brand-700"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
          />
          Select all on this page
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="size-5 accent-brand-700" checked={includeFlagged} onChange={(e) => setIncludeFlagged(e.target.checked)} />
          Include questions flagged by the AI review
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="size-5 accent-brand-700" checked={asPretest} onChange={(e) => setAsPretest(e.target.checked)} />
          Approve as pretest (unscored)
        </label>
        <button onClick={approveSelected} disabled={busy || selectedIds.length === 0} className="btn-primary">
          Approve selected ({selectedIds.length})
        </button>
      </div>

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      )}

      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.id} className="card">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label="Select this question"
                className="mt-1 size-5 shrink-0 accent-brand-700"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="badge bg-zinc-100 text-zinc-700">{r.testLabel}</span>
                  <span className="badge bg-zinc-100 text-zinc-700">{r.typeLabel}</span>
                  {r.difficultyLabel && <span className="badge bg-zinc-100 text-zinc-700">{r.difficultyLabel}</span>}
                  {r.roleName && <span className="badge bg-zinc-100 text-zinc-700">{r.roleName}</span>}
                  {r.languageName && <span className="badge bg-zinc-100 text-zinc-700">{r.languageName}</span>}
                  {r.reverseKeyed && <span className="badge bg-zinc-100 text-zinc-700">Reverse-keyed</span>}
                  <span className="badge bg-brand-50 text-brand-800">{SOURCE_LABEL[r.source]}</span>
                  {r.verdict && <span className={`badge ${VERDICT_STYLE[r.verdict]}`}>{VERDICT_LABEL[r.verdict]}</span>}
                </div>

                {r.originalText && <p className="mt-2 text-xs text-zinc-500">English original: {r.originalText}</p>}
                <p dir={r.rtl ? "rtl" : "ltr"} className={`mt-2 text-base text-zinc-900 ${r.rtl ? "text-right" : ""}`}>{r.content}</p>

                {r.options.length > 0 && (
                  <ol dir={r.rtl ? "rtl" : "ltr"} className="mt-2 flex flex-col gap-1 text-sm">
                    {r.options.map((o) => (
                      <li key={o.key} className={o.key === r.correctAnswer ? "font-medium text-green-800" : "text-zinc-700"}>
                        {o.key}. {o.text} {o.key === r.correctAnswer && <span className="text-xs">(correct)</span>}
                      </li>
                    ))}
                  </ol>
                )}

                {r.topic && <p className="mt-2 text-xs text-zinc-500">Topic: {r.topic}</p>}
                {r.explanation && <p className="mt-2 text-sm text-zinc-700"><span className="font-medium">Explanation:</span> {r.explanation}</p>}
                {r.reviewNotes && (
                  <p className="mt-2 whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    <span className="font-medium">Review notes:</span> {r.reviewNotes}
                  </p>
                )}

                {rejecting === r.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label htmlFor={`rej-${r.id}`} className="sr-only">Reason for rejecting</label>
                    <input id={`rej-${r.id}`} className="input mt-0 max-w-sm" placeholder="Reason (optional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                    <button disabled={busy} onClick={() => rejectOne(r.id)} className="min-h-11 text-sm font-medium text-red-700 underline">Confirm reject</button>
                    <button onClick={() => { setRejecting(null); setReason(""); }} className="min-h-11 text-sm text-zinc-600 underline">Cancel</button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5">
                    <button disabled={busy} onClick={() => approveOne(r.id)} className="min-h-11 text-sm font-medium text-brand-700 underline">Approve</button>
                    <Link href={`/admin/question-bank/${r.id}/edit?from=approvals`} className="min-h-11 content-center text-sm text-brand-700 underline">Edit</Link>
                    <button onClick={() => { setRejecting(r.id); setReason(""); }} className="min-h-11 text-sm text-red-600 underline">Reject</button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="card text-center text-zinc-500">Nothing is waiting for approval.</li>
        )}
      </ul>
    </div>
  );
}
