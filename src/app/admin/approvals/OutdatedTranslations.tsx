"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OutdatedRow = {
  id: string;
  languageName: string;
  rtl: boolean;
  translation: string;
  oldEnglish: string;
  newEnglish: string | null;
  /** A fresh translation of the new English wording is already waiting in the list below. */
  replacementWaiting: boolean;
};

/**
 * Translations whose English original got a new version. They stay in use until a translation of the new
 * wording is approved (which retires them automatically), or the admin retires them here.
 */
export default function OutdatedTranslations({ rows }: { rows: OutdatedRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function retire(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/questions/${id}/retire`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    router.refresh();
  }

  return (
    <section className="card mt-4 border-amber-300 bg-amber-50" aria-labelledby="outdated-h" data-testid="outdated-translations">
      <h2 id="outdated-h" className="font-semibold text-amber-900">Translations that need updating ({rows.length})</h2>
      <p className="mt-1 text-sm text-amber-900">
        The English question behind each of these got a new version, so the translation may no longer match. It stays in
        use until a translation of the new wording is approved (then it is retired automatically). Use{" "}
        <strong>Translate</strong> above to create the new translations, or retire one here.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{r.languageName}</p>
            <p className="mt-1 text-zinc-900" dir={r.rtl ? "rtl" : undefined} lang={r.rtl ? "ur" : undefined}>{r.translation}</p>
            <p className="mt-2 text-zinc-600"><span className="font-medium">English was:</span> {r.oldEnglish}</p>
            <p className="text-zinc-600"><span className="font-medium">English now:</span> {r.newEnglish ?? "(replacement not found)"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {r.replacementWaiting ? (
                <span className="text-green-700">A new translation is waiting for approval below.</span>
              ) : (
                <span className="text-amber-800">No new translation yet.</span>
              )}
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => retire(r.id)}>
                {busy === r.id ? "Retiring..." : "Retire this translation"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
