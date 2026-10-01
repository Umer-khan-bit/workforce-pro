"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RespondButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/candidate/contact-requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => respond("accept")}>Accept</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => respond("decline")}>Decline</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
