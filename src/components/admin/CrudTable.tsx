"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Column = {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select";
  options?: { value: string; label: string }[];
  /** Number columns only: an empty box saves as "no value" (for example, no upper limit). */
  nullable?: boolean;
  step?: number;
  width?: string;
};

type Row = Record<string, unknown> & { id?: string };

/**
 * Editable table for admin lookup data. Each row saves on its own through
 * /api/admin/reference/<entity>; a blank row at the top adds a new record.
 */
export default function CrudTable({
  entity,
  columns,
  rows,
  blank,
  addLabel,
}: {
  entity: string;
  columns: Column[];
  rows: Row[];
  blank: Row;
  addLabel: string;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-3 font-medium">{c.label}</th>
            ))}
            <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <CrudRow entity={entity} columns={columns} initial={blank} isNew addLabel={addLabel} />
          {rows.map((r) => (
            <CrudRow key={`${r.id}`} entity={entity} columns={columns} initial={r} addLabel={addLabel} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-zinc-500">
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CrudRow({
  entity,
  columns,
  initial,
  isNew,
  addLabel,
}: {
  entity: string;
  columns: Column[];
  initial: Row;
  isNew?: boolean;
  addLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Row>(initial);
  const [saved, setSaved] = useState<Row>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = isNew || columns.some((c) => values[c.key] !== saved[c.key]);

  function payload() {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = values[c.key];
      if (c.type === "number") out[c.key] = v === "" || v === null || v === undefined ? (c.nullable ? null : "") : Number(v);
      else out[c.key] = v;
    }
    return out;
  }

  async function request(method: "POST" | "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    const url = isNew || !initial.id ? `/api/admin/reference/${entity}` : `/api/admin/reference/${entity}/${initial.id}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(payload()),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      const formMsg = (data?.issues?.formErrors ?? [])[0] as string | undefined;
      setError(fieldMsg ?? formMsg ?? data?.error ?? "Something went wrong");
      return;
    }
    if (isNew) setValues(initial);
    else setSaved(values);
    router.refresh();
  }

  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <>
      <tr className={`border-b border-zinc-100 align-top ${isNew ? "bg-brand-50" : ""}`}>
        {columns.map((c) => (
          <td key={c.key} className="px-3 py-2" style={c.width ? { minWidth: c.width } : undefined}>
            {c.type === "checkbox" ? (
              <input
                type="checkbox"
                aria-label={c.label}
                checked={Boolean(values[c.key])}
                onChange={(e) => set(c.key, e.target.checked)}
                className="size-5 accent-brand-700"
              />
            ) : c.type === "select" ? (
              <select
                aria-label={c.label}
                value={String(values[c.key] ?? "")}
                onChange={(e) => set(c.key, e.target.value)}
                className="input mt-0"
              >
                <option value="">{isNew ? `Choose ${c.label.toLowerCase()}...` : "-"}</option>
                {c.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={c.label}
                type={c.type === "number" ? "number" : "text"}
                step={c.step}
                value={values[c.key] === null || values[c.key] === undefined ? "" : String(values[c.key])}
                onChange={(e) => set(c.key, e.target.value)}
                placeholder={isNew ? c.label : undefined}
                className="input mt-0"
              />
            )}
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {isNew ? (
            <button disabled={busy} onClick={() => request("POST")} className="btn-primary">
              {busy ? "Adding..." : addLabel}
            </button>
          ) : (
            <span className="inline-flex items-center gap-3">
              <button
                disabled={busy || !dirty}
                onClick={() => request("PATCH")}
                className="min-h-11 text-sm font-medium text-brand-700 underline disabled:text-zinc-400 disabled:no-underline"
              >
                Save
              </button>
              {confirmDelete ? (
                <>
                  <button disabled={busy} onClick={() => request("DELETE")} className="min-h-11 text-sm font-medium text-red-700 underline">
                    Confirm delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="min-h-11 text-sm text-zinc-600 underline">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="min-h-11 text-sm text-red-600 underline">
                  Delete
                </button>
              )}
            </span>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={columns.length + 1} className="px-3 pb-2 text-sm text-red-600" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
