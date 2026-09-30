"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TemplateRow = {
  key: string;
  name: string;
  description: string | null;
  channel: "EMAIL" | "IN_APP";
  variables: string[];
  subject: string;
  body: string;
  isActive: boolean;
};

export default function TemplatesManager({ templates }: { templates: TemplateRow[] }) {
  return (
    <div className="mt-6 flex max-w-3xl flex-col gap-5">
      {templates.map((t) => (
        <TemplateCard key={t.key} template={t} />
      ))}
    </div>
  );
}

function TemplateCard({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [isActive, setIsActive] = useState(template.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/message-templates/${template.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, isActive }),
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
    <section className="card flex flex-col gap-3" aria-labelledby={`t-${template.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`t-${template.key}`} className="font-semibold text-zinc-900">{template.name}</h2>
        <span className={`badge ${template.channel === "EMAIL" ? "bg-brand-50 text-brand-800" : "bg-zinc-100 text-zinc-700"}`}>
          {template.channel === "EMAIL" ? "Email" : "In-app"}
        </span>
      </div>
      {template.description && <p className="text-sm text-zinc-600">{template.description}</p>}

      <div>
        <label htmlFor={`sub-${template.key}`} className="label">
          {template.channel === "EMAIL" ? "Subject" : "Title"}
        </label>
        <input id={`sub-${template.key}`} className="input" value={subject} onChange={(e) => { setSaved(false); setSubject(e.target.value); }} />
      </div>
      <div>
        <label htmlFor={`body-${template.key}`} className="label">Message</label>
        <textarea id={`body-${template.key}`} className="input min-h-28" value={body} onChange={(e) => { setSaved(false); setBody(e.target.value); }} />
      </div>
      <p className="text-xs text-zinc-500">
        Placeholders you can use:{" "}
        {template.variables.map((v) => (
          <code key={v} className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5">{`{{${v}}}`}</code>
        ))}
      </p>

      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
        <input type="checkbox" className="size-5 accent-brand-700" checked={isActive} onChange={(e) => { setSaved(false); setIsActive(e.target.checked); }} />
        Active (turn off to stop sending this message)
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
      <div>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Saving..." : "Save"}</button>
      </div>
    </section>
  );
}
