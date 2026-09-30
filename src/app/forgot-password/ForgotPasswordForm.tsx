"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
        <p className="font-medium">Check your email</p>
        <p className="mt-1">
          If an account exists for that address, we have sent a link to reset the password. The link
          works once and expires soon.
        </p>
        <p className="mt-3">
          <Link href="/login" className="underline">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="fp-email" className="label">Email</label>
        <input id="fp-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Sending..." : "Send reset link"}</button>
      <Link href="/login" className="text-center text-sm text-brand-700 underline">Back to log in</Link>
    </form>
  );
}
