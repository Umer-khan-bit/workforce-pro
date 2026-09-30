"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const fieldMsg = Object.values(data?.issues?.fieldErrors ?? {}).flat()[0] as string | undefined;
      setError(fieldMsg ?? data?.error ?? "Something went wrong. Please try again.");
      setExpired(res.status === 400 && !fieldMsg);
      return;
    }
    router.push("/login?notice=reset");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="rp-password" className="label">New password</label>
        <input id="rp-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
      </div>
      <div>
        <label htmlFor="rp-confirm" className="label">Repeat the new password</label>
        <input id="rp-confirm" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {expired && (
        <p className="text-sm">
          <Link href="/forgot-password" className="text-brand-700 underline">Ask for a new link</Link>
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving..." : "Change password"}</button>
    </form>
  );
}
