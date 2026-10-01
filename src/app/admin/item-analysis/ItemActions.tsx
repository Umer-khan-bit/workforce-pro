"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The admin's decision on one question: keep it, retire it, or (for a calibrated pretest question) make it operational. */
export default function ItemActions({ id, flagged, canPromote }: { id: string; flagged: boolean; canPromote: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  async function act(action: "keep" | "retire" | "promote") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/items/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setConfirmRetire(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {flagged && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => act("keep")}>Keep it</button>}
        {flagged && !confirmRetire && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => setConfirmRetire(true)}>Retire</button>}
        {flagged && confirmRetire && (
          <>
            <button type="button" className="btn-primary min-h-9 px-3 py-1" disabled={busy} onClick={() => act("retire")}>Yes, retire it</button>
            <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => setConfirmRetire(false)}>Cancel</button>
          </>
        )}
        {canPromote && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => act("promote")}>Make operational</button>}
      </div>
      {error && <p role="alert" className="max-w-56 text-xs text-red-600">{error}</p>}
    </div>
  );
}
