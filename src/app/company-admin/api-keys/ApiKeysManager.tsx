"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KeyRow = { id: string; label: string; prefix: string; createdAt: string; lastUsedAt: string | null; revoked: boolean };

/** Create a labelled key (shown once) and revoke keys. */
export default function ApiKeysManager({ rows, canCreate }: { rows: KeyRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/company/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setCreated(data.key);
    setLabel("");
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/company/api-keys/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <div>
      {canCreate && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-3" aria-label="Create an API key">
          <div className="min-w-56 flex-1">
            <label htmlFor="k-label" className="label">Name for the new key</label>
            <input id="k-label" className="input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Our ATS" required />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Creating..." : "Create API key"}</button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" data-testid="key-error">{error}</p>}
      {created && (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4" data-testid="new-key">
          <p className="text-sm font-medium text-amber-900">Copy your key now. It is shown only once and we cannot show it again.</p>
          <p className="mt-2 break-all rounded bg-white p-2 font-mono text-sm text-zinc-900" data-testid="new-key-value">{created}</p>
          <button type="button" className="btn-secondary mt-2" onClick={async () => { try { await navigator.clipboard.writeText(created); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy key"}</button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[34rem] text-left text-sm" data-testid="keys-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-3">Name</th><th className="px-3 py-3">Key starts with</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Last used</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-zinc-600">No API keys yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} data-testid="key-row">
                <td className="px-3 py-3 font-medium text-zinc-900">{r.label}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.prefix}...</td>
                <td className="px-3 py-3">{r.createdAt}</td>
                <td className="px-3 py-3">{r.lastUsedAt ?? "Never"}</td>
                <td className="px-3 py-3">{r.revoked ? <span className="badge bg-zinc-100 text-zinc-700">Revoked</span> : <span className="badge bg-green-50 text-green-800">Active</span>}</td>
                <td className="px-3 py-3">{!r.revoked && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => revoke(r.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
