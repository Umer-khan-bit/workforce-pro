"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; name: string };

type Values = {
  name: string;
  phone: string;
  regionId: string;
  cityId: string;
  experienceYears: string;
  jobRoleId: string;
  minimumSalary: string;
  gender: string;
};

export default function ProfileForm({
  regions,
  cities,
  jobRoles,
  currencyCode,
  initial,
}: {
  regions: Item[];
  cities: (Item & { regionId: string })[];
  jobRoles: Item[];
  currencyCode: string;
  initial: Values;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = (k: keyof Values, value: string) => {
    setSaved(null);
    setV((p) => ({ ...p, [k]: value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        phone: v.phone,
        regionId: v.regionId,
        cityId: v.cityId,
        experienceYears: v.experienceYears,
        jobRoleId: v.jobRoleId,
        minimumSalary: v.minimumSalary,
        gender: v.gender,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      setError(fieldMsg ?? data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSaved(data.changed.length ? `Saved (${data.changed.join(", ")} updated).` : "Nothing changed.");
    router.refresh();
  }

  const regionCities = cities.filter((c) => c.regionId === v.regionId);

  return (
    <form onSubmit={handleSubmit} className="card mt-3 flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-name" className="label">Full name</label>
          <input id="pf-name" className="input" required minLength={2} value={v.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-phone" className="label">Phone</label>
          <input id="pf-phone" type="tel" className="input" required value={v.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-region" className="label">Region</label>
          <select
            id="pf-region"
            className="input"
            required
            value={v.regionId}
            onChange={(e) => {
              setSaved(null);
              setV((p) => ({ ...p, regionId: e.target.value, cityId: "" }));
            }}
          >
            <option value="" disabled>Select region</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pf-city" className="label">City</label>
          <select id="pf-city" className="input" required disabled={!v.regionId} value={v.cityId} onChange={(e) => set("cityId", e.target.value)}>
            <option value="" disabled>Select city</option>
            {regionCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pf-exp" className="label">Years of experience</label>
          <input id="pf-exp" type="number" min={0} max={60} className="input" required value={v.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-role" className="label">Job role</label>
          <select id="pf-role" className="input" required value={v.jobRoleId} onChange={(e) => set("jobRoleId", e.target.value)}>
            <option value="" disabled>Select job role</option>
            {jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-salary" className="label">Minimum expected salary per month ({currencyCode})</label>
          <input id="pf-salary" type="number" min={0} className="input max-w-xs" required value={v.minimumSalary} onChange={(e) => set("minimumSalary", e.target.value)} />
          <p className="mt-1 text-xs text-zinc-500">Recruiters can only contact you with an offer at or above this amount.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-gender" className="label">Gender (optional)</label>
          <select id="pf-gender" className="input max-w-xs" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Optional. Used only to check that the tests are fair to everyone. It is never shown to recruiters or companies.</p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">{saved}</p>}
      <div>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  );
}
