"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Runs a scheduled job by hand and shows what happened. */
export default function RunJobButton({ job, label = "Run now" }: { job: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/jobs/${job}/run`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMessage({ text: data?.error ?? "Something went wrong. Please try again.", ok: false });
    setMessage(data.status === "COMPLETED" ? { text: "Done.", ok: true } : { text: data.status === "SKIPPED" ? "It is already running." : (data.error ?? "It failed."), ok: false });
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={run} data-testid={`run-${job}`}>{busy ? "Running..." : label}</button>
      {message && <span role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
    </span>
  );
}
