"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type LessonItem = { id: string; title: string; content: string; durationMinutes: string; learners: number };

/** Add, edit, reorder and delete the lessons of one course. */
export default function LessonsEditor({ courseId, lessons }: { courseId: string; lessons: LessonItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState({ title: "", content: "", durationMinutes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(l: LessonItem | null) {
    setError(null);
    setEditing(l ? l.id : "new");
    setDraft(l ? { title: l.title, content: l.content, durationMinutes: l.durationMinutes } : { title: "", content: "", durationMinutes: "" });
  }

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const first = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors as Record<string, string[]>).flat()[0] : null;
      setError(first ?? data?.error ?? "Something went wrong. Please try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = editing === "new" ? await call(`/api/admin/courses/${courseId}/lessons`, "POST", draft) : await call(`/api/admin/lessons/${editing}`, "PATCH", draft);
    if (ok) setEditing(null);
  }

  return (
    <section aria-labelledby="lessons-h" data-testid="lessons-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 id="lessons-h" className="text-lg font-semibold text-zinc-900">Lessons ({lessons.length})</h2>
        <button type="button" className="btn-primary" onClick={() => open(null)} disabled={busy}>Add lesson</button>
      </div>

      {lessons.length === 0 && editing !== "new" && <p className="card mt-3 text-sm text-zinc-700">This course has no lessons yet.</p>}

      <ol className="mt-3 flex flex-col gap-3">
        {lessons.map((l, i) => (
          <li key={l.id} className="card" data-testid="lesson-row">
            {editing === l.id ? (
              <LessonFields draft={draft} setDraft={setDraft} onSubmit={save} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{i + 1}. {l.title}</p>
                  <p className="text-xs text-zinc-500">{l.durationMinutes ? `${l.durationMinutes} min · ` : ""}{l.learners} learner{l.learners === 1 ? "" : "s"} started</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" disabled={busy || i === 0} onClick={() => call(`/api/admin/lessons/${l.id}`, "PATCH", { direction: "up" })} aria-label={`Move ${l.title} up`}>Up</button>
                  <button type="button" className="btn-secondary" disabled={busy || i === lessons.length - 1} onClick={() => call(`/api/admin/lessons/${l.id}`, "PATCH", { direction: "down" })} aria-label={`Move ${l.title} down`}>Down</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => open(l)}>Edit</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => call(`/api/admin/lessons/${l.id}`, "DELETE")}>Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {editing === "new" && (
          <li className="card">
            <LessonFields draft={draft} setDraft={setDraft} onSubmit={save} onCancel={() => setEditing(null)} busy={busy} />
          </li>
        )}
      </ol>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function LessonFields({ draft, setDraft, onSubmit, onCancel, busy }: { draft: { title: string; content: string; durationMinutes: string }; setDraft: (d: { title: string; content: string; durationMinutes: string }) => void; onSubmit: (e: React.FormEvent) => void; onCancel: () => void; busy: boolean }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="l-title" className="label">Lesson title</label>
        <input id="l-title" className="input" value={draft.title} maxLength={150} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
      </div>
      <div>
        <label htmlFor="l-content" className="label">Lesson text</label>
        <textarea id="l-content" className="input" rows={6} maxLength={20000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
      </div>
      <div className="max-w-40">
        <label htmlFor="l-min" className="label">Minutes</label>
        <input id="l-min" type="number" min={1} max={600} className="input" value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })} />
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save lesson"}</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
