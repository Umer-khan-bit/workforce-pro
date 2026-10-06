"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Platform admin: give the company a plan for a number of days without a payment. */
export default function AssignPlanForm({ companyId, plans, defaultDays }: { companyId: string; plans: { code: string; name: string }[]; defaultDays: number }) {
  const router = useRouter();
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const [days, setDays] = useState(String(defaultDays));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/companies/${companyId}/subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode, days: Number(days) }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMessage({ text: data?.error ?? "Something went wrong. Please try again.", ok: false });
    setMessage({ text: "Plan assigned.", ok: true });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3" aria-label="Give a plan">
      <div>
        <label htmlFor="ap-plan" className="label">Plan</label>
        <select id="ap-plan" className="input" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ap-days" className="label">For (days)</label>
        <input id="ap-days" type="number" min={1} max={3650} className="input w-28" value={days} onChange={(e) => setDays(e.target.value)} required />
      </div>
      <button type="submit" className="btn-primary" disabled={busy || !planCode}>{busy ? "Saving..." : "Give plan"}</button>
      {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
    </form>
  );
}
