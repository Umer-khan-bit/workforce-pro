"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PilotForm({
  initialEnabled,
  initialCompanyId,
  companies,
}: {
  initialEnabled: boolean;
  initialCompanyId: string;
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/pilot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, companyId: companyId || null }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      setError(fieldMsg ?? data?.error ?? "Something went wrong");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card mt-6 flex max-w-xl flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-zinc-800">
        <input type="checkbox" className="size-5 accent-brand-700" checked={enabled} onChange={(e) => { setSaved(false); setEnabled(e.target.checked); }} />
        Pilot mode is on
      </label>
      <div>
        <label htmlFor="pilot-company" className="label">Company allowed in during the pilot</label>
        <select id="pilot-company" className="input" value={companyId} onChange={(e) => { setSaved(false); setCompanyId(e.target.value); }}>
          <option value="">Choose a company...</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
      <div>
        <button disabled={busy} onClick={save} className="btn-primary">{busy ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}
