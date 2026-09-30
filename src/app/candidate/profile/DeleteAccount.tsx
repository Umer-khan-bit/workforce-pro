"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

/** Two-step delete: open the warning, then type DELETE and your password. */
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirm }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      setError(fieldMsg ?? data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    await signOut({ redirectTo: "/login?notice=deleted" });
  }

  return (
    <div className="card mt-4 max-w-2xl border-red-200">
      <h3 className="font-semibold text-red-800">Delete my account</h3>
      <p className="mt-1 text-sm text-zinc-700">
        This permanently removes your name, email, phone, city, salary expectation, feedback and badges, and
        you will no longer appear to recruiters. Anonymous test statistics are kept so the assessments can be
        kept fair. You cannot undo this.
      </p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50">
          Delete my account...
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-4 flex flex-col gap-3" aria-label="Confirm account deletion">
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
            Are you sure? This cannot be undone.
          </p>
          <div>
            <label htmlFor="del-confirm" className="label">Type DELETE to confirm</label>
            <input id="del-confirm" className="input max-w-xs" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div>
            <label htmlFor="del-password" className="label">Your password</label>
            <input id="del-password" type="password" className="input max-w-xs" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy || confirm !== "DELETE" || !password} className="btn bg-red-700 text-white hover:bg-red-800">
              {busy ? "Deleting..." : "Permanently delete my account"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setConfirm(""); setPassword(""); setError(null); }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
