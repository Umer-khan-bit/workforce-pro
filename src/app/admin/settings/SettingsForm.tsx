"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOGO_MAX_CHARS, type SettingGroup } from "@/lib/settings/definitions";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/questionBank/schema";
import { generateBrandShades, BRAND_SHADES } from "@/lib/settings/brandColor";

type Values = Record<string, unknown>;

export default function SettingsForm({
  group,
  initial,
  planOptions = [],
  hints = {},
}: {
  group: SettingGroup;
  initial: Values;
  planOptions?: { value: string; label: string }[];
  hints?: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: unknown) => {
    setSaved(false);
    setValues((v) => ({ ...v, [name]: value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/settings/${group.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
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

  function handleLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (url.length > LOGO_MAX_CHARS) {
        setError("That logo is too large. Use an image under about 150 KB.");
        return;
      }
      setError(null);
      set("logoDataUrl", url);
    };
    reader.readAsDataURL(file);
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-4 flex max-w-3xl flex-col gap-5">
      <p className="text-sm text-zinc-600">{group.description}</p>

      {group.fields.map((f) => {
        const id = `s-${f.name}`;
        const value = values[f.name];
        return (
          <div key={f.name}>
            {f.type !== "tests" && f.type !== "image" && (
              <label htmlFor={id} className="label">{f.label}</label>
            )}

            {f.type === "text" && (
              <input id={id} className="input" value={String(value ?? "")} onChange={(e) => set(f.name, e.target.value)} />
            )}
            {f.type === "textarea" && (
              <textarea
                id={id}
                rows={f.rows ?? 3}
                className="input min-h-20 font-mono text-sm"
                value={String(value ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.type === "select" && (
              <select id={id} className="input max-w-64" value={String(value ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                {(f.optionsFrom === "plans" ? [{ value: "", label: "No plan" }, ...planOptions] : (f.options ?? [])).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {f.type === "number" && (
              <input
                id={id}
                type="number"
                step={f.step ?? 1}
                className="input max-w-48"
                value={value === undefined || value === null ? "" : String(value)}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.type === "color" && (
              <div>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    id={id}
                    type="color"
                    value={String(value ?? "#000000")}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="h-11 w-16 cursor-pointer rounded border border-zinc-300 bg-white p-1"
                  />
                  <input
                    aria-label="Colour code"
                    className="input mt-0 max-w-32 font-mono"
                    value={String(value ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                </div>
                {/^#[0-9a-fA-F]{6}$/.test(String(value)) && (
                  <div className="mt-3 flex overflow-hidden rounded-lg border border-zinc-200" aria-label="Generated shades">
                    {BRAND_SHADES.map((s) => (
                      <div
                        key={s}
                        title={`${s}: ${generateBrandShades(String(value))[s]}`}
                        className="h-8 flex-1"
                        style={{ background: generateBrandShades(String(value))[s] }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {f.type === "image" && (
              <div>
                <span className="label">{f.label}</span>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  {typeof value === "string" && value ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={value} alt="Current logo" className="h-12 max-w-40 rounded border border-zinc-200 bg-white object-contain p-1" />
                  ) : (
                    <span className="text-sm text-zinc-500">No logo uploaded</span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    aria-label="Upload logo"
                    onChange={(e) => handleLogo(e.target.files?.[0])}
                    className="text-sm"
                  />
                  {typeof value === "string" && value && (
                    <button type="button" onClick={() => set(f.name, null)} className="min-h-11 text-sm text-red-600 underline">
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            )}
            {f.type === "tests" && (
              <fieldset>
                <legend className="label">{f.label}</legend>
                <div className="mt-1 flex flex-wrap gap-x-5">
                  {TEST_TYPES.map((t) => {
                    const list = (Array.isArray(value) ? value : []) as string[];
                    return (
                      <label key={t} className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          className="size-5 accent-brand-700"
                          checked={list.includes(t)}
                          onChange={(e) => set(f.name, e.target.checked ? [...list, t] : list.filter((x) => x !== t))}
                        />
                        {TEST_TYPE_LABELS[t]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {hints[f.name] && <p className="mt-1 text-xs font-medium text-brand-800" data-testid={`hint-${f.name}`}>{hints[f.name]}</p>}
            <p className="mt-1 text-xs text-zinc-500">{f.help}</p>
            {f.placeholders && (
              <p className="mt-1 text-xs text-zinc-500">
                Placeholders:{" "}
                {f.placeholders.map((v) => (
                  <code key={v} className="mr-1.5 rounded bg-zinc-100 px-1">{`{{${v}}}`}</code>
                ))}
              </p>
            )}
          </div>
        );
      })}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}

      <div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
