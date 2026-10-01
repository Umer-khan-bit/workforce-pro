"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Pay for a plan change. In demo mode a second button simulates a declined payment; no real money moves. */
export default function PlanCheckoutForm({ planCode, amountLabel, free, demo }: { planCode: string; amountLabel: string; free: boolean; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(simulate: "success" | "failure") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/subscription/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode, simulate }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.push("/company-admin/subscription?changed=1");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => pay("success")} data-testid="pay">{busy ? "Processing..." : free ? "Confirm the change" : `Pay ${amountLabel}`}</button>
        {demo && !free && <button type="button" className="btn-secondary" disabled={busy} onClick={() => pay("failure")} data-testid="pay-fail">Simulate a failed payment</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600" data-testid="pay-error">{error}</p>}
    </div>
  );
}
