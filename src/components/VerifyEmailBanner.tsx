"use client";

import { useState } from "react";

/** Shown to signed-in users who have not confirmed their email yet. */
export default function VerifyEmailBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setMessage({ text: data?.error ?? "Something went wrong. Please try again.", ok: false });
      return;
    }
    if (data?.alreadyVerified) setMessage({ text: "Your email is already confirmed. Refresh the page.", ok: true });
    else if (data?.delivered === false) {
      setMessage({ text: "Email sending is not set up on this server, so the link was written to the server log instead.", ok: true });
    } else setMessage({ text: `A new link is on its way to ${email}.`, ok: true });
  }

  return (
    <div role="status" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Please confirm your email address</p>
      <p className="mt-0.5">
        We sent a link to {email}. Until you confirm it you can log in, but you cannot take assessments or contact candidates.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={resend} disabled={busy} className="min-h-11 text-sm font-medium underline">
          {busy ? "Sending..." : "Send the link again"}
        </button>
        {message && <span className={message.ok ? "text-green-800" : "text-red-700"}>{message.text}</span>}
      </div>
    </div>
  );
}
