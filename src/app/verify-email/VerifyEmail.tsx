"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type State = "working" | "done" | "failed";

/** Confirms the address as soon as the page opens (the emailed link is single-use). */
export default function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(token ? "working" : "failed");
  const [message, setMessage] = useState<string | null>(token ? null : "This page needs the link from your email.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // React strict mode runs effects twice in development; the token can only be used once
    (async () => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setState("done");
      } else {
        setState("failed");
        setMessage(data?.error ?? "Something went wrong. Please try again.");
      }
    })();
  }, [token]);

  if (state === "working") return <p className="mt-4 text-sm text-zinc-600" role="status">Confirming your email...</p>;

  if (state === "done") {
    return (
      <div role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
        <p className="font-medium">Your email address is confirmed.</p>
        <p className="mt-3"><Link href="/" className="btn-primary">Continue</Link></p>
      </div>
    );
  }

  return (
    <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
      <p>{message}</p>
      <p className="mt-3"><Link href="/" className="underline">Go to the app</Link> to ask for a new link.</p>
    </div>
  );
}
