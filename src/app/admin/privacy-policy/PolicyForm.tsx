"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PolicyForm({
  initialTitle,
  initialBody,
  suggestedVersion,
}: {
  initialTitle: string;
  initialBody: string;
  suggestedVersion: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [version, setVersion] = useState(suggestedVersion);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const res = await fetch("/api/admin/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, version, body }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      setError(fieldMsg ?? data?.error ?? "Something went wrong");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-4 flex max-w-3xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="p-title" className="label">Title</label>
          <input id="p-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-version" className="label">New version number</label>
          <input id="p-version" className="input" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="p-body" className="label">Policy text</label>
        <textarea id="p-body" className="input min-h-72" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-1 text-xs text-zinc-500">Separate paragraphs with a blank line. Plain text only.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p role="status" className="text-sm text-green-700">Published. It is now the version candidates accept at signup.</p>}
      <div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Publishing..." : "Publish new version"}
        </button>
      </div>
    </form>
  );
}
