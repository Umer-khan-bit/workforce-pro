"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RowActions({ id, retired }: { id: string; retired: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "retire" | "restore") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/questions/${id}/${action}`, { method: "POST" });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4">
      <Link href={`/admin/question-bank/${id}/edit`} className="min-h-11 content-center text-sm text-brand-700 underline">
        Edit
      </Link>
      {retired ? (
        <button disabled={busy} onClick={() => run("restore")} className="min-h-11 text-sm text-brand-700 underline">
          Restore
        </button>
      ) : confirming ? (
        <span className="flex items-center gap-3">
          <button disabled={busy} onClick={() => run("retire")} className="min-h-11 text-sm font-medium text-red-700 underline">
            Confirm retire
          </button>
          <button onClick={() => setConfirming(false)} className="min-h-11 text-sm text-zinc-600 underline">
            Cancel
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="min-h-11 text-sm text-red-600 underline">
          Retire
        </button>
      )}
      {error && <span className="w-full text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
