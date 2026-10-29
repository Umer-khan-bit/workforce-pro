"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "clear" | "void" | "undo";

export default function ReviewButtons({ sessionId, mode }: { sessionId: string; mode: "waiting" | "voided" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/admin/integrity/${sessionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === "waiting" ? (
        <>
          <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => run("clear")}>{busy === "clear" ? "Clearing..." : "Clear flag"}</button>
          <button type="button" className="btn-secondary text-red-700" disabled={busy !== null} onClick={() => run("void")}>{busy === "void" ? "Voiding..." : "Void result"}</button>
        </>
      ) : (
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => run("undo")}>{busy === "undo" ? "Undoing..." : "Undo void"}</button>
      )}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
