"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Makes (or remakes) the fairness report for a month. */
export default function GenerateReport({ months, selected }: { months: string[]; selected: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/fairness/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.push(`/admin/fairness?month=${month}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="f-month" className="label">Month</label>
        <select id="f-month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <button type="button" className="btn-primary" disabled={busy} onClick={run} data-testid="generate-fairness">{busy ? "Making the report..." : "Make or refresh this month's report"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
