"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OpeningRow = {
  id: string;
  title: string;
  jobRoleId: string;
  roleName: string;
  city: string;
  salaryRangeMin: number;
  salaryRangeMax: number;
  status: "OPEN" | "PAUSED" | "FILLED" | "CLOSED";
  createdBy: string;
  createdAt: string;
  shortlisted: number;
  requests: number;
  canEdit: boolean;
};

type Form = { title: string; jobRoleId: string; city: string; salaryRangeMin: string; salaryRangeMax: string; status: OpeningRow["status"] };
const EMPTY: Form = { title: "", jobRoleId: "", city: "", salaryRangeMin: "", salaryRangeMax: "", status: "OPEN" };
const STATUS_LABELS = { OPEN: "Open", PAUSED: "Paused", FILLED: "Filled", CLOSED: "Closed" } as const;
const STATUS_STYLE = { OPEN: "bg-green-50 text-green-800", PAUSED: "bg-amber-50 text-amber-800", FILLED: "bg-brand-50 text-brand-800", CLOSED: "bg-zinc-100 text-zinc-700" } as const;

/** Create, edit, pause, fill, close and delete job openings. The server enforces the plan limit and ownership. */
export default function OpeningsManager({ rows, roles, cities, moneyCode, showOwner, limitNote }: { rows: OpeningRow[]; roles: { id: string; name: string }[]; cities: string[]; moneyCode: string; showOwner: boolean; limitNote: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function open(row: OpeningRow | null) {
    setError(null);
    setEditing(row ? row.id : "new");
    setForm(row ? { title: row.title, jobRoleId: row.jobRoleId, city: row.city, salaryRangeMin: String(row.salaryRangeMin), salaryRangeMax: String(row.salaryRangeMax), status: row.status } : { ...EMPTY, jobRoleId: roles[0]?.id ?? "" });
  }

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const first = data?.issues?.fieldErrors ? (Object.values(data.issues.fieldErrors as Record<string, string[]>).flat()[0] ?? null) : null;
      setError(first ?? data?.error ?? "Something went wrong. Please try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, salaryRangeMin: Number(form.salaryRangeMin || 0), salaryRangeMax: Number(form.salaryRangeMax || 0) };
    const ok = editing === "new" ? await call("/api/job-openings", "POST", body) : await call(`/api/job-openings/${editing}`, "PATCH", body);
    if (ok) setEditing(null);
  }

  const formView = (
    <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2" aria-label={editing === "new" ? "New job opening" : "Edit job opening"}>
      <div>
        <label htmlFor="o-role" className="label">Job role</label>
        <select id="o-role" className="input" value={form.jobRoleId} onChange={(e) => set("jobRoleId", e.target.value)} required>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="o-title" className="label">Title (optional)</label>
        <input id="o-title" className="input" maxLength={80} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior accountant" />
      </div>
      <div>
        <label htmlFor="o-city" className="label">City</label>
        <select id="o-city" className="input" value={form.city} onChange={(e) => set("city", e.target.value)}>
          <option value="">Any city</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="o-status" className="label">Status</label>
        <select id="o-status" className="input" value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
          {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="o-min" className="label">Lowest monthly salary ({moneyCode})</label>
        <input id="o-min" type="number" min={0} className="input" value={form.salaryRangeMin} onChange={(e) => set("salaryRangeMin", e.target.value)} required />
      </div>
      <div>
        <label htmlFor="o-max" className="label">Highest monthly salary you can offer ({moneyCode})</label>
        <input id="o-max" type="number" min={1} className="input" value={form.salaryRangeMax} onChange={(e) => set("salaryRangeMax", e.target.value)} required />
        <p className="mt-1 text-xs text-zinc-500">Candidates whose minimum is above this will not see or be shown this opening.</p>
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save job opening"}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600" data-testid="opening-limit">{limitNote}</p>
        {editing === null && <button type="button" className="btn-primary" onClick={() => open(null)} data-testid="new-opening">New job opening</button>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" data-testid="opening-error">{error}</p>}
      {editing === "new" && <div className="mt-4">{formView}</div>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[46rem] text-left text-sm" data-testid="openings-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-3">Job opening</th>
              <th className="px-3 py-3">Salary ({moneyCode})</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Shortlisted</th>
              <th className="px-3 py-3">Requests</th>
              {showOwner && <th className="px-3 py-3">Created by</th>}
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && <tr><td colSpan={showOwner ? 7 : 6} className="px-3 py-6 text-zinc-600">No job openings yet.</td></tr>}
            {rows.map((r) =>
              editing === r.id ? (
                <tr key={r.id}><td colSpan={showOwner ? 7 : 6} className="p-3">{formView}</td></tr>
              ) : (
                <tr key={r.id} data-testid="opening-row">
                  <td className="px-3 py-3"><p className="font-medium text-zinc-900">{r.title || r.roleName}</p><p className="text-xs text-zinc-500">{r.title ? `${r.roleName} · ` : ""}{r.city || "Any city"} · {r.createdAt}</p></td>
                  <td className="px-3 py-3 tabular-nums">{r.salaryRangeMin.toLocaleString()} - {r.salaryRangeMax.toLocaleString()}</td>
                  <td className="px-3 py-3"><span className={`badge ${STATUS_STYLE[r.status]}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td className="px-3 py-3">{r.shortlisted}</td>
                  <td className="px-3 py-3">{r.requests}</td>
                  {showOwner && <td className="px-3 py-3">{r.createdBy}</td>}
                  <td className="px-3 py-3">
                    {r.canEdit ? (
                      <span className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => open(r)}>Edit</button>
                        <button type="button" className="btn-secondary min-h-9 px-3 py-1" disabled={busy} onClick={() => call(`/api/job-openings/${r.id}`, "DELETE")}>Delete</button>
                      </span>
                    ) : <span className="text-xs text-zinc-500">View only</span>}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
