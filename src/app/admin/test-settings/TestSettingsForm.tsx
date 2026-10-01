"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TestConfigValues = {
  minItems: number;
  maxItems: number;
  seThreshold: number;
  timeLimitMinutes: number;
  retakeWaitingDays: number;
  pretestItemCount: number;
};

const FIELDS: Array<{ key: keyof TestConfigValues; label: string; step?: number }> = [
  { key: "minItems", label: "Minimum questions" },
  { key: "maxItems", label: "Maximum questions" },
  { key: "seThreshold", label: "Stop when SE below", step: 0.01 },
  { key: "timeLimitMinutes", label: "Time limit (minutes)" },
  { key: "retakeWaitingDays", label: "Days before retake" },
  { key: "pretestItemCount", label: "Unscored pretest questions" },
];

export default function TestSettingsForm({
  testType,
  title,
  adaptive,
  initial,
}: {
  testType: string;
  title: string;
  adaptive: boolean;
  initial: TestConfigValues;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([k, val]) => [k, String(val)]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/test-config/${testType}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === "" ? "" : Number(val)]))),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      const formMsg = (data?.issues?.formErrors ?? [])[0] as string | undefined;
      setError(fieldMsg ?? formMsg ?? data?.error ?? "Something went wrong");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-4" aria-labelledby={`tc-${testType}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`tc-${testType}`} className="font-semibold text-zinc-900">{title}</h2>
        <span className="badge bg-zinc-100 text-zinc-700">{adaptive ? "Adaptive" : "Fixed length"}</span>
      </div>
      {!adaptive && (
        <p className="text-sm text-zinc-600">
          This test is not adaptive: it serves the same number of questions to everyone, and the stop
          rule is not used.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`${testType}-${f.key}`} className="label">{f.label}</label>
            <input
              id={`${testType}-${f.key}`}
              type="number"
              step={f.step ?? 1}
              className="input"
              value={v[f.key]}
              onChange={(e) => { setSaved(false); setV((p) => ({ ...p, [f.key]: e.target.value })); }}
            />
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
      <div>
        <button disabled={busy} onClick={save} className="btn-primary">{busy ? "Saving..." : "Save"}</button>
      </div>
    </section>
  );
}
