"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EndpointRow = { id: string; url: string; events: string[]; isActive: boolean };
export type DeliveryRow = { id: string; endpointUrl: string; event: string; status: string; attempt: number; when: string; responseStatus: number | null; error: string | null; nextAttempt: string | null };

/** Add, switch, test and delete webhooks; the delivery log with a Resend button. */
export default function WebhooksManager({ endpoints, deliveries, events, canCreate, demoReceiverUrl }: { endpoints: EndpointRow[]; deliveries: DeliveryRow[]; events: { key: string; label: string }[]; canCreate: boolean; demoReceiverUrl: string | null }) {
  const router = useRouter();
  const selectable = events.filter((e) => e.key !== "webhook.test");
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>(selectable.map((e) => e.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(request: () => Promise<Response>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await request();
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) setError((data?.error as string) ?? "Something went wrong. Please try again.");
    return { ok: res.ok, data };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSecret(null);
    const r = await call(() => fetch("/api/company/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events: chosen }) }));
    if (r.ok) {
      setSecret(r.data?.secret as string);
      setUrl("");
      router.refresh();
    }
  }
  async function test(id: string) {
    const r = await call(() => fetch(`/api/company/webhooks/${id}/test`, { method: "POST" }));
    if (r.ok) {
      setMessage(r.data?.status === "SUCCESS" ? "The test event was delivered." : `The test event failed: ${(r.data?.error as string) ?? "no answer"}`);
      router.refresh();
    }
  }
  async function resend(id: string) {
    const r = await call(() => fetch(`/api/company/webhooks/deliveries/${id}/resend`, { method: "POST" }));
    if (r.ok) router.refresh();
  }
  async function patch(id: string, body: unknown) {
    const r = await call(() => fetch(`/api/company/webhooks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (r.ok) router.refresh();
  }
  async function remove(id: string) {
    const r = await call(() => fetch(`/api/company/webhooks/${id}`, { method: "DELETE" }));
    if (r.ok) router.refresh();
  }
  const toggle = (key: string) => setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  return (
    <div>
      {canCreate && (
        <form onSubmit={add} className="card flex flex-col gap-4" aria-label="Add a webhook">
          <div>
            <label htmlFor="w-url" className="label">Address that should receive events</label>
            <input id="w-url" type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ats.example.com/hooks/workforce" required />
            <p className="mt-1 text-xs text-zinc-500">Must start with https:// and be reachable from the internet.{demoReceiverUrl && <> In demo mode you can try <code className="break-all">{demoReceiverUrl}</code>.</>}</p>
          </div>
          <fieldset>
            <legend className="label">Events</legend>
            <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {selectable.map((e) => (
                <label key={e.key} className="flex items-start gap-2 text-sm text-zinc-800"><input type="checkbox" className="mt-0.5 size-4" checked={chosen.includes(e.key)} onChange={() => toggle(e.key)} />{e.label}</label>
              ))}
            </div>
          </fieldset>
          <div><button type="submit" className="btn-primary" disabled={busy || chosen.length === 0}>{busy ? "Saving..." : "Add webhook"}</button></div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" data-testid="webhook-error">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-zinc-700" data-testid="webhook-message">{message}</p>}
      {secret && (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4" data-testid="new-secret">
          <p className="text-sm font-medium text-amber-900">Copy the signing secret now. It is shown only once.</p>
          <p className="mt-2 break-all rounded bg-white p-2 font-mono text-sm" data-testid="new-secret-value">{secret}</p>
          <p className="mt-2 text-xs text-amber-900">Every event carries <code>X-Workforce-Signature: sha256=...</code>, the HMAC-SHA256 of <code>timestamp + &quot;.&quot; + body</code> with this secret, and <code>X-Workforce-Timestamp</code>.</p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm" data-testid="webhooks-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Address</th><th className="px-3 py-3">Events</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {endpoints.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-zinc-600">No webhooks yet.</td></tr>}
            {endpoints.map((w) => (
              <tr key={w.id} data-testid="webhook-row">
                <td className="max-w-64 break-all px-3 py-3">{w.url}</td>
                <td className="px-3 py-3 text-xs text-zinc-600">{w.events.join(", ")}</td>
                <td className="px-3 py-3">{w.isActive ? <span className="badge bg-green-50 text-green-800">On</span> : <span className="badge bg-zinc-100 text-zinc-700">Off</span>}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => test(w.id)}>Send test</button>
                    <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => patch(w.id, { isActive: !w.isActive })}>{w.isActive ? "Switch off" : "Switch on"}</button>
                    <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => remove(w.id)}>Delete</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Delivery log</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm" data-testid="deliveries-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Event</th><th className="px-3 py-3">Address</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Attempt</th><th className="px-3 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {deliveries.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-zinc-600">Nothing has been sent yet.</td></tr>}
            {deliveries.map((d) => (
              <tr key={d.id} data-testid="delivery-row">
                <td className="whitespace-nowrap px-3 py-3">{d.when}</td>
                <td className="px-3 py-3">{d.event}</td>
                <td className="max-w-48 break-all px-3 py-3 text-xs">{d.endpointUrl}</td>
                <td className="px-3 py-3">
                  {d.status === "SUCCESS" ? <span className="badge bg-green-50 text-green-800">Delivered{d.responseStatus ? ` (${d.responseStatus})` : ""}</span> : d.status === "FAILED" ? <span className="badge bg-red-50 text-red-700">Failed</span> : <span className="badge bg-zinc-100 text-zinc-700">Pending</span>}
                  {d.error && <p className="mt-1 text-xs text-zinc-600">{d.error}</p>}
                  {d.nextAttempt && <p className="mt-1 text-xs text-zinc-500">Next try {d.nextAttempt}</p>}
                </td>
                <td className="px-3 py-3">{d.attempt}</td>
                <td className="px-3 py-3">{d.status !== "SUCCESS" && <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => resend(d.id)}>Resend</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
