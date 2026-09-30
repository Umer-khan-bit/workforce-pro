"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string; untranslated: number };

export default function TranslatePanel({ languages, keyMissing }: { languages: Option[]; keyMissing: boolean }) {
  const router = useRouter();
  const [languageId, setLanguageId] = useState(languages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = languages.find((l) => l.id === languageId);

  async function run() {
    if (!languageId || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    let created = 0;
    let cost = 0;
    for (;;) {
      const res = await fetch("/api/admin/ai/translate-ipip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        break;
      }
      created += data.created;
      cost += data.costEstimate;
      setStatus(`Translated ${created} so far, ${data.remaining} to go.`);
      // Stop when done, or when a batch produced nothing (so a stuck item cannot loop forever).
      if (data.remaining === 0 || data.created === 0) {
        setStatus(
          data.remaining === 0
            ? `Done: ${created} translations are waiting for your review below (estimated cost $${cost.toFixed(4)}).`
            : `Stopped: ${data.remaining} items could not be translated. Try again later.`
        );
        break;
      }
    }
    setBusy(false);
    router.refresh();
  }

  if (languages.length === 0) {
    return (
      <p className="card mt-4 text-sm text-zinc-600">
        Add a second language under Roles, regions &amp; languages to translate the personality items.
      </p>
    );
  }

  return (
    <section className="card mt-4" aria-labelledby="translate-h">
      <h2 id="translate-h" className="font-semibold text-zinc-900">Translate the personality items</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Translates the imported IPIP statements with AI and saves each one as Pending, linked to its
        English original, with a back-translation and an AI check of the meaning. Items already
        translated are skipped.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="t-lang" className="label">Translate into</label>
          <select id="t-lang" className="input" value={languageId} onChange={(e) => setLanguageId(e.target.value)} disabled={busy}>
            {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button onClick={run} disabled={busy || keyMissing || !selected || selected.untranslated === 0} className="btn-primary">
          {busy ? "Translating..." : selected && selected.untranslated === 0 ? "All translated" : `Translate ${selected?.untranslated ?? 0} items`}
        </button>
      </div>
      {keyMissing && <p role="alert" className="mt-3 text-sm text-amber-800">The Anthropic API key is not set. Add ANTHROPIC_API_KEY to the .env file and restart the app.</p>}
      {status && <p role="status" className="mt-3 text-sm text-green-700">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
