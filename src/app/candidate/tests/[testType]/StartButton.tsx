"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TestType } from "@prisma/client";

export default function StartButton({ testType, label }: { testType: TestType; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tests/${testType}/start`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(`/candidate/tests/session/${data.sessionId}`);
  }

  return (
    <div>
      <button type="button" onClick={start} disabled={busy} className="btn-primary w-full sm:w-auto">
        {busy ? "Starting..." : label}
      </button>
      <p className="mt-2 text-xs text-zinc-500">The timer starts as soon as you press the button.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
