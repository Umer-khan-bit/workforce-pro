"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Switch a user on or off, or make them change their password at the next sign-in. */
export default function UserActions({ id, isActive, mustChangePassword, isSelf, deleted }: { id: string; isActive: boolean; mustChangePassword: boolean; isSelf: boolean; deleted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deleted) return <span className="text-xs text-zinc-500">Deleted by owner</span>;

  async function patch(body: Record<string, boolean>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy || (isSelf && isActive)} onClick={() => patch({ isActive: !isActive })}>{isActive ? "Deactivate" : "Activate"}</button>
        {!mustChangePassword && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => patch({ mustChangePassword: true })}>Require new password</button>}
      </div>
      {error && <p role="alert" className="max-w-56 text-xs text-red-600">{error}</p>}
    </div>
  );
}
