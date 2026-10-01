"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FeatureDef = { key: string; label: string; description: string | null; kind: "BOOLEAN" | "LIMIT" };
export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  isActive: boolean;
  sortOrder: number;
  features: Record<string, boolean | number | null>;
  subscriptions: number;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  priceMonthly: string;
  isActive: boolean;
  sortOrder: string;
  features: Record<string, boolean | number | null>;
};

function errorText(data: { error?: string; issues?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } } | null) {
  const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0];
  return fieldMsg ?? data?.issues?.formErrors?.[0] ?? data?.error ?? "Something went wrong";
}

export default function PlansManager({
  plans,
  features,
  currencyCode,
}: {
  plans: PlanRow[];
  features: FeatureDef[];
  currencyCode: string;
}) {
  const blankFeatures = Object.fromEntries(features.map((f) => [f.key, f.kind === "BOOLEAN" ? false : 0]));
  return (
    <div className="mt-6 flex flex-col gap-10">
      <section aria-labelledby="plans-h">
        <h2 id="plans-h" className="text-lg font-semibold text-zinc-900">Plans</h2>
        <div className="mt-3 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {plans.map((p) => (
            <PlanForm key={p.id} features={features} currencyCode={currencyCode} plan={p} />
          ))}
          <PlanForm
            features={features}
            currencyCode={currencyCode}
            plan={{
              id: "",
              code: "",
              name: "",
              description: "",
              priceMonthly: 0,
              isActive: true,
              sortOrder: plans.length + 1,
              features: blankFeatures,
              subscriptions: 0,
            }}
            isNew
          />
        </div>
      </section>

      <section aria-labelledby="features-h">
        <h2 id="features-h" className="text-lg font-semibold text-zinc-900">Plan features</h2>
        <p className="mb-3 mt-1 text-sm text-zinc-600">
          The options each plan can switch on or off. You can reword them here; a new option is added
          together with the code that enforces it.
        </p>
        <div className="flex max-w-3xl flex-col gap-3">
          {features.map((f) => (
            <FeatureRow key={f.key} feature={f} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanForm({
  plan,
  features,
  currencyCode,
  isNew,
}: {
  plan: PlanRow;
  features: FeatureDef[];
  currencyCode: string;
  isNew?: boolean;
}) {
  const router = useRouter();
  const initial: FormState = {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    priceMonthly: String(plan.priceMonthly),
    isActive: plan.isActive,
    sortOrder: String(plan.sortOrder),
    features: plan.features,
  };
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dom = isNew ? "new" : plan.id;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setSaved(false);
    setS((p) => ({ ...p, [k]: v }));
  };
  const setFeature = (key: string, v: boolean | number | null) => set("features", { ...s.features, [key]: v });

  async function call(method: "POST" | "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = {
      ...(isNew ? { code: s.code } : {}),
      name: s.name,
      description: s.description,
      priceMonthly: s.priceMonthly === "" ? "" : Number(s.priceMonthly),
      isActive: s.isActive,
      sortOrder: s.sortOrder === "" ? "" : Number(s.sortOrder),
      features: s.features,
    };
    const res = await fetch(isNew ? "/api/admin/plans" : `/api/admin/plans/${plan.id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      setError(errorText(data));
      return;
    }
    if (isNew) setS(initial);
    else setSaved(true);
    router.refresh();
  }

  return (
    <section className={`card flex flex-col gap-4 ${isNew ? "border-dashed bg-brand-50" : ""}`} aria-labelledby={`plan-${dom}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`plan-${dom}`} className="font-semibold text-zinc-900">
          {isNew ? "Add a new plan" : plan.name}
        </h3>
        {!isNew && (
          <span className="text-xs text-zinc-500">
            {plan.code} · {plan.subscriptions} subscription{plan.subscriptions === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isNew && (
          <div>
            <label htmlFor={`code-${dom}`} className="label">Code</label>
            <input id={`code-${dom}`} className="input" value={s.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. enterprise" />
          </div>
        )}
        <div>
          <label htmlFor={`name-${dom}`} className="label">Name</label>
          <input id={`name-${dom}`} className="input" value={s.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label htmlFor={`price-${dom}`} className="label">Price per month ({currencyCode})</label>
          <input id={`price-${dom}`} type="number" min={0} className="input" value={s.priceMonthly} onChange={(e) => set("priceMonthly", e.target.value)} />
        </div>
        <div>
          <label htmlFor={`order-${dom}`} className="label">Display order</label>
          <input id={`order-${dom}`} type="number" min={0} className="input" value={s.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`desc-${dom}`} className="label">Description</label>
          <input id={`desc-${dom}`} className="input" value={s.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="label">Features</legend>
        {features.map((f) => {
          const v = s.features[f.key];
          return f.kind === "BOOLEAN" ? (
            <label key={f.key} className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
              <input type="checkbox" className="size-5 accent-brand-700" checked={v === true} onChange={(e) => setFeature(f.key, e.target.checked)} />
              {f.label}
            </label>
          ) : (
            <div key={f.key} className="flex flex-wrap items-center gap-3 py-1 text-sm text-zinc-700">
              <span className="min-w-56">{f.label}</span>
              <input
                type="number"
                min={0}
                aria-label={f.label}
                disabled={v === null}
                className="input mt-0 w-28"
                value={v === null ? "" : String(v ?? 0)}
                onChange={(e) => setFeature(f.key, e.target.value === "" ? 0 : Number(e.target.value))}
              />
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5 accent-brand-700" checked={v === null} onChange={(e) => setFeature(f.key, e.target.checked ? null : 0)} />
                Unlimited
              </label>
            </div>
          );
        })}
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
        <input type="checkbox" className="size-5 accent-brand-700" checked={s.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (companies can subscribe to it)
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={busy} onClick={() => call(isNew ? "POST" : "PATCH")} className="btn-primary">
          {busy ? "Saving..." : isNew ? "Create plan" : "Save plan"}
        </button>
        {!isNew &&
          (confirmDelete ? (
            <>
              <button disabled={busy} onClick={() => call("DELETE")} className="min-h-11 text-sm font-medium text-red-700 underline">Confirm delete</button>
              <button onClick={() => setConfirmDelete(false)} className="min-h-11 text-sm text-zinc-600 underline">Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="min-h-11 text-sm text-red-600 underline">Delete plan</button>
          ))}
      </div>
    </section>
  );
}

function FeatureRow({ feature }: { feature: FeatureDef }) {
  const router = useRouter();
  const [label, setLabel] = useState(feature.label);
  const [description, setDescription] = useState(feature.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = label !== feature.label || description !== (feature.description ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/plan-features/${feature.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, description }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(errorText(data));
    router.refresh();
  }

  return (
    <div className="card flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor={`fl-${feature.key}`} className="label">
          {feature.kind === "BOOLEAN" ? "On/off option" : "Numeric limit"} <span className="font-normal text-zinc-500">({feature.key})</span>
        </label>
        <input id={`fl-${feature.key}`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="flex-1">
        <label htmlFor={`fd-${feature.key}`} className="label">Description</label>
        <input id={`fd-${feature.key}`} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button disabled={busy || !dirty} onClick={save} className="btn-secondary">Save</button>
      {error && <p role="alert" className="text-sm text-red-600 sm:basis-full">{error}</p>}
    </div>
  );
}
