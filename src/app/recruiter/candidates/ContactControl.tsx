"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpeningOption } from "./ShortlistControl";

/** Ask a candidate for permission to contact them about one of the open job openings. */
export default function ContactControl({ candidateId, openings, contactedOpenings }: { candidateId: string; openings: OpeningOption[]; contactedOpenings: string[] }) {
  const router = useRouter();
  const available = openings.filter((o) => !contactedOpenings.includes(o.id));
  const [openingId, setOpeningId] = useState(available[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (openings.length === 0) return <p className="text-sm text-zinc-600">Create a job opening to contact candidates.</p>;
  if (available.length === 0 && !sent) return <p className="text-sm text-zinc-600">You have already sent this candidate a request for each of your open job openings.</p>;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/recruiter/contact-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateProfileId: candidateId, jobOpeningId: openingId, message }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setSent(true);
    router.refresh();
  }

  if (sent) return <p role="status" className="text-sm text-green-700" data-testid="request-sent">Request sent. The candidate will see it under Recruiter requests.</p>;

  return (
    <form onSubmit={send} className="flex flex-col gap-3" aria-label="Contact request">
      <div>
        <label htmlFor="c-opening" className="label">Job opening</label>
        <select id="c-opening" className="input" value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
          {available.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="c-message" className="label">Message (optional)</label>
        <textarea id="c-message" className="input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say a little about the role." />
      </div>
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Sending..." : "Send contact request"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600" data-testid="contact-error">{error}</p>}
    </form>
  );
}
