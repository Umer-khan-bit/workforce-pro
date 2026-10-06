"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildSearchQuery } from "@/lib/recruiter/searchParams";
import type { SearchFilters, SearchSort } from "@/lib/recruiter/searchTypes";

type Reply = { filters: SearchFilters; sort: SearchSort | null; summary: string; notes: string[] };

/** Describe who you need in plain words; Claude turns it into filters, which are shown and then applied. */
export default function AiSearchBox({ example, offer, opening, enabled, blockedMessage }: { example: string; offer: number | null; opening: string | null; enabled: boolean; blockedMessage: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiter/ai-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: text }) });
      const data = (await res.json().catch(() => null)) as (Reply & { error?: string }) | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "The AI search did not work. Please try again.");
        return;
      }
      const qs = buildSearchQuery({ filters: data.filters, sort: data.sort ?? "overall", offer, opening });
      const understood = [data.summary, ...data.notes].join(" ");
      router.push(`/recruiter/candidates?${qs}${qs ? "&" : ""}ai=${encodeURIComponent(understood.slice(0, 600))}`);
    } catch {
      setError("The AI search did not work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="card" aria-labelledby="ai-search-h" data-testid="ai-search">
      <h2 id="ai-search-h" className="font-semibold text-zinc-900">AI search</h2>
      <p className="mt-0.5 text-sm text-zinc-600">Describe who you need, for example: <em>{example}</em>.</p>
      {enabled ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <label htmlFor="ai-q" className="sr-only">Describe the candidates you need</label>
          <input id="ai-q" className="input mt-0 min-w-64 flex-1" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Who are you looking for?" />
          <button type="submit" className="btn-primary" disabled={busy || text.trim().length < 3}>{busy ? "Reading..." : "Search with AI"}</button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-amber-800" data-testid="ai-search-locked">{blockedMessage}</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
