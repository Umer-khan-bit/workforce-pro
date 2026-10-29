"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConcernButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/integrity/concerns/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review" }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" disabled={busy} onClick={review}>{busy ? "Saving..." : "Mark reviewed"}</button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
